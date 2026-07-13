"""Milestone 14 acceptance check: resolves a new question (getting back an
answer_id, per the schema change this milestone made), edits it via
PATCH /qa/answers/{id} (simulating the user editing the field after it was
auto-filled), confirms the edit persisted, then deletes it via
DELETE /qa/answers/{id} (simulating unchecking the "save" toggle) and
confirms it's gone from answer_bank and a fresh resolve of the same
question goes through the LLM again rather than finding a stale match.

Requires the API server running locally (uvicorn app.main:app --port 8000).

Usage:
    uv run python scripts/qa_answer_management_smoke_check.py
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


def answer_bank_row(user_id: str, question_text: str) -> dict | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select id, answer_text from answer_bank where user_id = %s and question_text = %s",
                (user_id, question_text),
            )
            row = cur.fetchone()
            return {"id": str(row[0]), "answer_text": row[1]} if row else None


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
    email = f"qa-manage-{tag}@example.invalid"
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

        question = "Describe a challenging project you worked on and how you overcame obstacles."

        resolve_resp = httpx.post(
            "http://127.0.0.1:8000/qa/resolve", headers=api_headers, json={"question_text": question}, timeout=30
        )
        resolve_resp.raise_for_status()
        body = resolve_resp.json()
        answer_id = body["answer_id"]
        print(f"Resolved -> answer_id={answer_id} source={body['source']}")
        assert body["source"] == "llm_generated"

        # Simulate the user editing the field after autofill (blur -> UPDATE_ANSWER)
        edited_text = "I edited this answer myself to be more specific."
        patch_resp = httpx.patch(
            f"http://127.0.0.1:8000/qa/answers/{answer_id}",
            headers=api_headers,
            json={"answer_text": edited_text},
            timeout=10,
        )
        patch_resp.raise_for_status()
        print(f"Patched -> {patch_resp.json()}")

        row_after_patch = answer_bank_row(user_id, question)
        patch_ok = row_after_patch is not None and row_after_patch["answer_text"] == edited_text
        print(f"Raw DB row after patch: {row_after_patch}")

        # Simulate unchecking "save for future applications"
        delete_resp = httpx.delete(f"http://127.0.0.1:8000/qa/answers/{answer_id}", headers=api_headers, timeout=10)
        print(f"Delete status: {delete_resp.status_code}")
        delete_ok = delete_resp.status_code == 204

        row_after_delete = answer_bank_row(user_id, question)
        deleted_ok = row_after_delete is None
        print(f"Row after delete: {row_after_delete}")

        # A fresh resolve of the same question should go through the LLM
        # again now, not find a stale/deleted match.
        resolve_again = httpx.post(
            "http://127.0.0.1:8000/qa/resolve", headers=api_headers, json={"question_text": question}, timeout=30
        )
        resolve_again.raise_for_status()
        fresh_ok = resolve_again.json()["source"] == "llm_generated"
        print(f"Re-resolve after delete -> source={resolve_again.json()['source']}")

        # Clean up the second answer this created
        httpx.delete(
            f"http://127.0.0.1:8000/qa/answers/{resolve_again.json()['answer_id']}", headers=api_headers, timeout=10
        )

        ok = patch_ok and delete_ok and deleted_ok and fresh_ok
        print("PASS" if ok else "FAIL", "- answer edit persists, delete removes it, re-resolve doesn't find a stale match")

    finally:
        if user_id:
            httpx.delete(f"{base_url}/auth/v1/admin/users/{user_id}", headers=admin_headers, timeout=10)
            print(f"Cleaned up test user {user_id}")


if __name__ == "__main__":
    main()
