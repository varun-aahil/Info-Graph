from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from backend.app.core.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()

# Ensure SQLAlchemy uses psycopg (v3) driver, not the missing psycopg2
_db_url = settings.database_url
if _db_url.startswith("postgresql://"):
    _db_url = _db_url.replace("postgresql://", "postgresql+psycopg://", 1)

# Disable psycopg3 prepared statements — they conflict with Supabase's
# PgBouncer transaction pooler, causing DuplicatePreparedStatement errors
# when multiple workers hit the same pooled connection.
engine = create_engine(
    _db_url,
    pool_pre_ping=True,
    connect_args={"prepare_threshold": None},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    import logging
    from sqlalchemy.exc import OperationalError

    logger = logging.getLogger(__name__)

    from backend.app.models import entities  # noqa: F401

    try:
        with engine.begin() as connection:
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))

        Base.metadata.create_all(bind=engine)
        with engine.begin() as connection:
            legacy_user_id = "00000000-0000-0000-0000-000000000000"
            connection.execute(
                text(
                    """
                    INSERT INTO users (id, email, name, hashed_password, provider, is_active, is_verified, created_at, updated_at)
                    VALUES (
                        :legacy_user_id,
                        'legacy@local.invalid',
                        'Legacy Local User',
                        'disabled',
                        'email',
                        false,
                        true,
                        NOW(),
                        NOW()
                    )
                    ON CONFLICT (id) DO NOTHING
                    """
                ),
                {"legacy_user_id": legacy_user_id},
            )
            connection.execute(text("CREATE SEQUENCE IF NOT EXISTS workspace_settings_id_seq"))
            connection.execute(
                text(
                    """
                    SELECT setval(
                        'workspace_settings_id_seq',
                        GREATEST(COALESCE((SELECT MAX(id) FROM workspace_settings), 0), 1)
                    )
                    """
                )
            )
            connection.execute(
                text("ALTER TABLE workspace_settings ALTER COLUMN id SET DEFAULT nextval('workspace_settings_id_seq')")
            )
            connection.execute(text("ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS cloud_api_key TEXT"))
            connection.execute(
                text(
                    "ALTER TABLE workspace_settings "
                    "ADD COLUMN IF NOT EXISTS cloud_chat_model VARCHAR(255) NOT NULL DEFAULT 'gpt-4.1-mini'"
                )
            )
            connection.execute(
                text(
                    "ALTER TABLE workspace_settings "
                    "ADD COLUMN IF NOT EXISTS cloud_embedding_model VARCHAR(255) "
                    "NOT NULL DEFAULT 'text-embedding-3-small'"
                )
            )
            connection.execute(text("ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)"))
            connection.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)"))
            connection.execute(text("ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)"))
            connection.execute(text("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)"))
            connection.execute(text("ALTER TABLE document_graph_points ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)"))
            connection.execute(
                text("UPDATE workspace_settings SET user_id = :legacy_user_id WHERE user_id IS NULL"),
                {"legacy_user_id": legacy_user_id},
            )
            connection.execute(
                text("UPDATE documents SET user_id = :legacy_user_id WHERE user_id IS NULL"),
                {"legacy_user_id": legacy_user_id},
            )
            connection.execute(
                text(
                    """
                    UPDATE ingestion_jobs AS job
                    SET user_id = doc.user_id
                    FROM documents AS doc
                    WHERE job.document_id = doc.id AND job.user_id IS NULL
                    """
                )
            )
            connection.execute(
                text(
                    """
                    UPDATE document_chunks AS chunk
                    SET user_id = doc.user_id
                    FROM documents AS doc
                    WHERE chunk.document_id = doc.id AND chunk.user_id IS NULL
                    """
                )
            )
            connection.execute(
                text(
                    """
                    UPDATE document_graph_points AS point
                    SET user_id = doc.user_id
                    FROM documents AS doc
                    WHERE point.document_id = doc.id AND point.user_id IS NULL
                    """
                )
            )
            connection.execute(
                text("UPDATE ingestion_jobs SET user_id = :legacy_user_id WHERE user_id IS NULL"),
                {"legacy_user_id": legacy_user_id},
            )
            connection.execute(
                text("UPDATE document_chunks SET user_id = :legacy_user_id WHERE user_id IS NULL"),
                {"legacy_user_id": legacy_user_id},
            )
            connection.execute(
                text("UPDATE document_graph_points SET user_id = :legacy_user_id WHERE user_id IS NULL"),
                {"legacy_user_id": legacy_user_id},
            )
            for table_name in (
                "workspace_settings",
                "documents",
                "ingestion_jobs",
                "document_chunks",
                "document_graph_points",
            ):
                connection.execute(text(f"ALTER TABLE {table_name} ALTER COLUMN user_id SET NOT NULL"))
                connection.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table_name}_user_id ON {table_name} (user_id)"))
            connection.execute(
                text("CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_settings_user_id ON workspace_settings (user_id)")
            )
    except OperationalError as exc:
        # Another worker likely completed the migration — log and continue
        logger.warning("init_db OperationalError (likely deadlock from concurrent workers): %s", exc)

