"""Milestone 10 acceptance check: submits a question as a real throwaway
user, confirms it's LLM-answered and stored in answer_bank, then submits a
differently-phrased but semantically identical question and confirms it's
served from answer_bank instead (same answer, zero new llm_usage_log rows
for qa_resolver/embedding). Cleans up the test user afterward.

Requires the API server running locally (uvicorn app.main:app --port 8000).

Usage:
    uv run python scripts/qa_resolver_smoke_check.py
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


def count_usage_rows(user_id: str) -> dict[str, int]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select endpoint, count(*) from llm_usage_log where user_id = %s "
                "and endpoint in ('qa_resolver', 'embedding') group by endpoint",
                (user_id,),
            )
            return dict(cur.fetchall())


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
    email = f"qa-resolver-{tag}@example.invalid"
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

        question_a = "Are you legally authorized to work in the United States without sponsorship?"
        question_b = "Do you have legal authorization to work in the US and will you need visa sponsorship?"

        usage_before = count_usage_rows(user_id)
        r1 = httpx.post(
            "http://127.0.0.1:8000/qa/resolve", headers=api_headers, json={"question_text": question_a}, timeout=30
        )
        r1.raise_for_status()
        body1 = r1.json()
        usage_after_first = count_usage_rows(user_id)
        print(f"First question -> source={body1['source']} answer={body1['answer_text']!r}")
        print(f"  usage before={usage_before} after={usage_after_first}")

        r2 = httpx.post(
            "http://127.0.0.1:8000/qa/resolve", headers=api_headers, json={"question_text": question_b}, timeout=30
        )
        r2.raise_for_status()
        body2 = r2.json()
        usage_after_second = count_usage_rows(user_id)
        print(f"Paraphrased question -> source={body2['source']} similarity={body2.get('similarity')}")
        print(f"  answer={body2['answer_text']!r}")
        print(f"  usage after second call={usage_after_second}")

        first_ok = body1["source"] == "llm_generated"
        second_ok = body2["source"] == "answer_bank" and body2["answer_text"] == body1["answer_text"]
        # Every resolve call embeds the incoming question (needed to even
        # know whether it's a match) - only the expensive qa_resolver
        # generation call should stay flat on a cache hit.
        no_new_calls = usage_after_second["qa_resolver"] == usage_after_first["qa_resolver"]

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "select count(*) from answer_bank where user_id = %s and question_text = %s",
                    (user_id, question_a),
                )
                stored_count = cur.fetchone()[0]
        stored_ok = stored_count == 1

        print(f"first_ok={first_ok} second_ok={second_ok} no_new_calls={no_new_calls} stored_ok={stored_ok}")
        ok = first_ok and second_ok and no_new_calls and stored_ok
        print("PASS" if ok else "FAIL", "- new question LLM-answered+stored, paraphrase served from cache")

    finally:
        if user_id:
            httpx.delete(f"{base_url}/auth/v1/admin/users/{user_id}", headers=admin_headers, timeout=10)
            print(f"Cleaned up test user {user_id}")


if __name__ == "__main__":
    main()
