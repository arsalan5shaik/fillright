import httpx

from app.core.config import get_settings


def user_scoped_client(access_token: str) -> httpx.Client:
    """A PostgREST client that acts as the calling user, not the backend.

    The user's own access token is forwarded as the Authorization bearer, so
    PostgREST evaluates RLS against their auth.uid() - the same isolation
    guarantees proven in Milestone 1 apply here too, not just at the raw-SQL
    level. The service-role key is only used as `apikey` for Kong's gateway
    routing, not as the authority for row access.
    """
    settings = get_settings()
    return httpx.Client(
        base_url=f"{settings.supabase_url}/rest/v1",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": settings.supabase_service_role_key,
            "Content-Type": "application/json",
        },
        timeout=15,
    )
