"""Milestone 6 acceptance check: saves both a non-sensitive and a sensitive
common-question answer for a real throwaway user, then confirms:
  - the non-sensitive one is stored in plaintext (is_encrypted=false)
  - the sensitive one is stored as real ciphertext (is_encrypted=true, and
    the *raw* DB value - inspected via the privileged connection, bypassing
    the API's own decryption - does not equal the plaintext answer)
  - GET /answers/common correctly decrypts the sensitive one back to the
    original plaintext
  - the "decline to answer" path is stored encrypted like any other answer

Requires the API server running locally (uvicorn app.main:app --port 8000).

Usage:
    uv run python scripts/common_answers_smoke_check.py
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
    email = f"common-answers-{tag}@example.invalid"
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

        # Find one non-sensitive and one sensitive question via the public
        # common_questions table (any authenticated user can read it).
        rest_headers = {"Authorization": f"Bearer {access_token}", "apikey": service_key}
        questions_resp = httpx.get(
            f"{base_url}/rest/v1/common_questions",
            headers=rest_headers,
            params={"select": "id,category,is_sensitive,answer_options"},
            timeout=10,
        )
        questions_resp.raise_for_status()
        questions = questions_resp.json()
        non_sensitive = next(q for q in questions if not q["is_sensitive"])
        sensitive = next(q for q in questions if q["is_sensitive"] and q["category"] == "background_check")
        decline_option = next(o for o in sensitive["answer_options"] if "decline" in o.lower())

        # 1) Non-sensitive answer -> plaintext
        r1 = httpx.put(
            f"http://127.0.0.1:8000/answers/common/{non_sensitive['id']}",
            headers=api_headers,
            json={"answer_value": "Yes"},
            timeout=10,
        )
        r1.raise_for_status()
        print(f"Non-sensitive save -> {r1.json()}")
        assert r1.json()["is_encrypted"] is False

        # 2) Sensitive answer (decline) -> should be encrypted
        r2 = httpx.put(
            f"http://127.0.0.1:8000/answers/common/{sensitive['id']}",
            headers=api_headers,
            json={"answer_value": decline_option},
            timeout=10,
        )
        r2.raise_for_status()
        print(f"Sensitive (decline) save -> {r2.json()}")
        assert r2.json()["is_encrypted"] is True
        assert r2.json()["answer_value"] == decline_option

        # 3) Inspect the RAW DB value directly (bypassing the API entirely)
        #    to prove it's genuine ciphertext, not just a flag that says so.
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "select answer_value, is_encrypted from user_common_answers "
                    "where user_id = %s and common_question_id = %s",
                    (user_id, sensitive["id"]),
                )
                raw_value, is_encrypted_flag = cur.fetchone()
        print(f"Raw DB value for sensitive answer: {raw_value!r}")
        raw_is_ciphertext = raw_value != decline_option and is_encrypted_flag is True

        # 4) GET /answers/common decrypts it back correctly
        list_resp = httpx.get("http://127.0.0.1:8000/answers/common", headers=api_headers, timeout=10)
        list_resp.raise_for_status()
        answers = {a["common_question_id"]: a for a in list_resp.json()}
        decrypted_ok = answers[sensitive["id"]]["answer_value"] == decline_option
        plaintext_ok = answers[non_sensitive["id"]]["answer_value"] == "Yes"

        print(f"GET /answers/common -> {list_resp.json()}")
        ok = raw_is_ciphertext and decrypted_ok and plaintext_ok
        print("PASS" if ok else "FAIL", "- sensitive answer stored as real ciphertext, decrypts correctly, non-sensitive stays plaintext")

    finally:
        if user_id:
            httpx.delete(f"{base_url}/auth/v1/admin/users/{user_id}", headers=admin_headers, timeout=10)
            print(f"Cleaned up test user {user_id}")


if __name__ == "__main__":
    main()
