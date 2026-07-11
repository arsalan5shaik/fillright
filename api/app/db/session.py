import psycopg

from app.core.config import get_settings


def get_connection() -> psycopg.Connection:
    """A privileged (service-role) connection, used for backend/admin writes
    like llm_usage_log — not for user-scoped reads/writes, which should go
    through RLS via the user's own JWT once the auth layer (Milestone 3)
    exists."""
    return psycopg.connect(get_settings().supabase_db_url, autocommit=True)
