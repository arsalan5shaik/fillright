"""Milestone 3 acceptance check: creates a throwaway Supabase Auth user, gets
a real access token for it, calls the running FastAPI /me endpoint, confirms
200 + correct user id, then deletes the test user. Requires the API server
running locally (uvicorn app.main:app --port 8000).

Usage:
    uv run python scripts/auth_smoke_check.py
"""

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    base_url = settings.supabase_url
    service_key = settings.supabase_service_role_key
    admin_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    tag = uuid.uuid4().hex[:8]
    email = f"auth-test-{tag}@example.invalid"
    password = uuid.uuid4().hex

    user_id = None
    try:
        created = httpx.post(
            f"{base_url}/auth/v1/admin/users",
            headers=admin_headers,
            json={"email": email, "password": password, "email_confirm": True},
            timeout=10,
        )
        created.raise_for_status()
        user_id = created.json()["id"]
        print(f"Created test user: {user_id}")

        token_resp = httpx.post(
            f"{base_url}/auth/v1/token?grant_type=password",
            headers={"apikey": service_key, "Content-Type": "application/json"},
            json={"email": email, "password": password},
            timeout=10,
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]
        print("Obtained real access token")

        me_resp = httpx.get(
            "http://127.0.0.1:8000/me",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        print(f"GET /me -> status={me_resp.status_code} body={me_resp.json()}")

        ok = me_resp.status_code == 200 and me_resp.json().get("id") == user_id
        print("PASS: /me returned correct user for a real token" if ok else "FAIL")

    finally:
        if user_id:
            httpx.delete(f"{base_url}/auth/v1/admin/users/{user_id}", headers=admin_headers, timeout=10)
            print(f"Cleaned up test user {user_id}")


if __name__ == "__main__":
    main()
