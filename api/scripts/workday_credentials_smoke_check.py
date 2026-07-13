"""Workday-credentials feature acceptance check: saves an email/password for
a real throwaway user via PUT /profile/workday-credentials, then confirms:
  - GET /profile/workday-credentials decrypts the password back correctly
  - the *raw* DB value (inspected via a privileged connection, bypassing the
    API's own decryption) is genuine ciphertext, not the plaintext password
  - PUT again with a new password overwrites (upsert), not duplicates

Requires the API server running locally (uvicorn app.main:app --port 8000).

Usage:
    uv run python scripts/workday_credentials_smoke_check.py
"""

import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))

import httpx

from app.core.config import get_settings
from app.db.session import get_connection


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
    settings = get_settings()
    base_url = settings.supabase_url
    service_key = settings.supabase_service_role_key
    admin_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    publishable_key = _load_web_env(ROOT / "web" / ".env.local")["NEXT_PUBLIC_SUPABASE_ANON_KEY"]

    tag = uuid.uuid4().hex[:8]
    email = f"workday-creds-{tag}@example.invalid"
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

        token_resp = httpx.post(
            f"{base_url}/auth/v1/token?grant_type=password",
            headers={"apikey": publishable_key, "Content-Type": "application/json"},
            json={"email": email, "password": password},
            timeout=10,
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]
        api_headers = {"Authorization": f"Bearer {access_token}"}

        workday_email = "me@mycompany-applications.invalid"
        workday_password = "S3cretWorkdayPass!"

        # 1) GET before any save -> both null
        r0 = httpx.get("http://127.0.0.1:8000/profile/workday-credentials", headers=api_headers, timeout=10)
        r0.raise_for_status()
        print(f"GET before save -> {r0.json()}")
        assert r0.json() == {"email": None, "password": None}

        # 2) PUT saves email + encrypted password
        r1 = httpx.put(
            "http://127.0.0.1:8000/profile/workday-credentials",
            headers=api_headers,
            json={"email": workday_email, "password": workday_password},
            timeout=10,
        )
        r1.raise_for_status()
        print(f"PUT save -> {r1.json()}")
        assert r1.json() == {"email": workday_email, "password": workday_password}

        # 3) Raw DB value must be genuine ciphertext, not the plaintext password
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "select email, encrypted_password from workday_credentials where user_id = %s",
                    (user_id,),
                )
                raw_email, raw_encrypted_password = cur.fetchone()
        print(f"Raw DB row: email={raw_email!r} encrypted_password={raw_encrypted_password!r}")
        raw_is_ciphertext = raw_encrypted_password != workday_password and raw_email == workday_email

        # 4) GET decrypts the password back correctly
        r2 = httpx.get("http://127.0.0.1:8000/profile/workday-credentials", headers=api_headers, timeout=10)
        r2.raise_for_status()
        print(f"GET after save -> {r2.json()}")
        decrypted_ok = r2.json() == {"email": workday_email, "password": workday_password}

        # 5) PUT again with a new password -> upsert, not a duplicate row
        new_password = "AnotherPass456!"
        r3 = httpx.put(
            "http://127.0.0.1:8000/profile/workday-credentials",
            headers=api_headers,
            json={"email": workday_email, "password": new_password},
            timeout=10,
        )
        r3.raise_for_status()
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("select count(*) from workday_credentials where user_id = %s", (user_id,))
                (row_count,) = cur.fetchone()
        r4 = httpx.get("http://127.0.0.1:8000/profile/workday-credentials", headers=api_headers, timeout=10)
        r4.raise_for_status()
        print(f"GET after overwrite -> {r4.json()}, row_count={row_count}")
        upsert_ok = row_count == 1 and r4.json()["password"] == new_password

        ok = raw_is_ciphertext and decrypted_ok and upsert_ok
        print(
            "PASS" if ok else "FAIL",
            "- password stored as real ciphertext, decrypts correctly, overwrite upserts instead of duplicating",
        )

    finally:
        if user_id:
            httpx.delete(f"{base_url}/auth/v1/admin/users/{user_id}", headers=admin_headers, timeout=10)
            print(f"Cleaned up test user {user_id}")


if __name__ == "__main__":
    main()
