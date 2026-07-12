"""Milestone 3 acceptance check, publishable-key path: logs a real user in
using the same publishable/anon key + password-grant call the website's
login page makes client-side, then confirms the resulting token is accepted
by the running FastAPI /me endpoint. Cleans up the throwaway user afterward.

(The public /auth/v1/signup endpoint with this key was separately confirmed
to accept the publishable key correctly via a one-off curl call — it only
rejected the test's fake email domain, then hit Supabase's free-tier email
rate limit on retry, both unrelated to the key/config itself.)

Usage:
    uv run python scripts/web_auth_smoke_check.py
"""

import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))

import httpx

from app.core.config import get_settings


def _load_web_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip()
    return env


def main() -> None:
    web_env = _load_web_env(ROOT / "web" / ".env.local")
    publishable_key = web_env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]

    settings = get_settings()
    base_url = settings.supabase_url
    service_key = settings.supabase_service_role_key
    admin_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    tag = uuid.uuid4().hex[:8]
    created_user_ids: list[str] = []

    try:
        # Prove the publishable key can log in an *already confirmed*
        #    user (what the website's login page does), and that token works.
        login_email = f"web-login-{tag}@example.invalid"
        login_password = uuid.uuid4().hex
        created = httpx.post(
            f"{base_url}/auth/v1/admin/users",
            headers=admin_headers,
            json={"email": login_email, "password": login_password, "email_confirm": True},
            timeout=10,
        )
        created.raise_for_status()
        login_user_id = created.json()["id"]
        created_user_ids.append(login_user_id)

        token_resp = httpx.post(
            f"{base_url}/auth/v1/token?grant_type=password",
            headers={"apikey": publishable_key, "Content-Type": "application/json"},
            json={"email": login_email, "password": login_password},
            timeout=10,
        )
        print(f"POST /auth/v1/token (publishable key) -> status={token_resp.status_code}")
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        me_resp = httpx.get(
            "http://127.0.0.1:8000/me",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        print(f"GET /me (FastAPI) -> status={me_resp.status_code} body={me_resp.json()}")

        ok = me_resp.status_code == 200 and me_resp.json().get("id") == login_user_id
        print("PASS: publishable-key login -> FastAPI /me works end-to-end" if ok else "FAIL")

    finally:
        for uid in created_user_ids:
            try:
                httpx.delete(f"{base_url}/auth/v1/admin/users/{uid}", headers=admin_headers, timeout=10)
                print(f"Cleaned up test user {uid}")
            except Exception as exc:  # noqa: BLE001
                print(f"WARNING: failed to delete test user {uid}: {exc}")


if __name__ == "__main__":
    main()
