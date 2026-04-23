"""Add cloud provider credentials and model settings."""

from alembic import op
import sqlalchemy as sa

revision = "0002_cloud_provider_settings"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS cloud_api_key TEXT")
    op.execute(
        "ALTER TABLE workspace_settings "
        "ADD COLUMN IF NOT EXISTS cloud_chat_model VARCHAR(255) NOT NULL DEFAULT 'gpt-4.1-mini'"
    )
    op.execute(
        "ALTER TABLE workspace_settings "
        "ADD COLUMN IF NOT EXISTS cloud_embedding_model VARCHAR(255) "
        "NOT NULL DEFAULT 'text-embedding-3-small'"
    )


def downgrade() -> None:
    op.drop_column("workspace_settings", "cloud_embedding_model")
    op.drop_column("workspace_settings", "cloud_chat_model")
    op.drop_column("workspace_settings", "cloud_api_key")
