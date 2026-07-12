import httpx

from app.core.config import get_settings


def upload_object(access_token: str, bucket: str, path: str, content: bytes, content_type: str) -> None:
    """Uploads via the user's own access token so storage.objects RLS applies
    (objects are keyed "{user_id}/...", enforced by the Milestone 8
    migration's policies) - same pattern as db/postgrest.py for table data.
    """
    settings = get_settings()
    resp = httpx.post(
        f"{settings.supabase_url}/storage/v1/object/{bucket}/{path}",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": settings.supabase_service_role_key,
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        content=content,
        timeout=30,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Storage upload failed ({resp.status_code}): {resp.text}")


def create_signed_url(access_token: str, bucket: str, path: str, expires_in: int = 3600) -> str:
    settings = get_settings()
    resp = httpx.post(
        f"{settings.supabase_url}/storage/v1/object/sign/{bucket}/{path}",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": settings.supabase_service_role_key,
        },
        json={"expiresIn": expires_in},
        timeout=15,
    )
    resp.raise_for_status()
    signed_path = resp.json()["signedURL"]
    return f"{settings.supabase_url}/storage/v1{signed_path}"
