from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from backend.app.core.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from backend.app.models import entities  # noqa: F401

    Base.metadata.create_all(bind=engine)

    with engine.begin() as connection:
        legacy_user_id = "00000000-0000-0000-0000-000000000000"
        connection.execute(
            text(
                """
                INSERT INTO users (id, email, name, hashed_password, provider, is_active, created_at, updated_at)
                VALUES (
                    :legacy_user_id,
                    'legacy@local.invalid',
                    'Legacy Local User',
                    'disabled',
                    'email',
                    false,
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
