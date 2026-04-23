"""Add JWT users and tenant ownership columns."""

from alembic import op
import sqlalchemy as sa

revision = "0003_auth_multi_tenant"
down_revision = "0002_cloud_provider_settings"
branch_labels = None
depends_on = None

LEGACY_USER_ID = "00000000-0000-0000-0000-000000000000"


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default="email"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.execute(
        f"""
        INSERT INTO users (id, email, name, hashed_password, provider, is_active, created_at, updated_at)
        VALUES (
            '{LEGACY_USER_ID}',
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
    )

    for table_name in (
        "workspace_settings",
        "documents",
        "ingestion_jobs",
        "document_chunks",
        "document_graph_points",
    ):
        op.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)")

    op.execute("CREATE SEQUENCE IF NOT EXISTS workspace_settings_id_seq")
    op.execute(
        """
        SELECT setval(
            'workspace_settings_id_seq',
            GREATEST(COALESCE((SELECT MAX(id) FROM workspace_settings), 0), 1)
        )
        """
    )
    op.execute("ALTER TABLE workspace_settings ALTER COLUMN id SET DEFAULT nextval('workspace_settings_id_seq')")

    op.execute(f"UPDATE workspace_settings SET user_id = '{LEGACY_USER_ID}' WHERE user_id IS NULL")
    op.execute(f"UPDATE documents SET user_id = '{LEGACY_USER_ID}' WHERE user_id IS NULL")
    op.execute(
        """
        UPDATE ingestion_jobs AS job
        SET user_id = doc.user_id
        FROM documents AS doc
        WHERE job.document_id = doc.id AND job.user_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE document_chunks AS chunk
        SET user_id = doc.user_id
        FROM documents AS doc
        WHERE chunk.document_id = doc.id AND chunk.user_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE document_graph_points AS point
        SET user_id = doc.user_id
        FROM documents AS doc
        WHERE point.document_id = doc.id AND point.user_id IS NULL
        """
    )
    for table_name in ("ingestion_jobs", "document_chunks", "document_graph_points"):
        op.execute(f"UPDATE {table_name} SET user_id = '{LEGACY_USER_ID}' WHERE user_id IS NULL")

    for table_name in (
        "workspace_settings",
        "documents",
        "ingestion_jobs",
        "document_chunks",
        "document_graph_points",
    ):
        op.alter_column(table_name, "user_id", existing_type=sa.String(length=36), nullable=False)
        op.create_index(f"ix_{table_name}_user_id", table_name, ["user_id"])
        op.create_foreign_key(
            f"fk_{table_name}_user_id_users",
            table_name,
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )

    op.create_unique_constraint("uq_workspace_settings_user_id", "workspace_settings", ["user_id"])


def downgrade() -> None:
    op.drop_constraint("uq_workspace_settings_user_id", "workspace_settings", type_="unique")
    for table_name in (
        "document_graph_points",
        "document_chunks",
        "ingestion_jobs",
        "documents",
        "workspace_settings",
    ):
        op.drop_constraint(f"fk_{table_name}_user_id_users", table_name, type_="foreignkey")
        op.drop_index(f"ix_{table_name}_user_id", table_name=table_name)
        op.drop_column(table_name, "user_id")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
