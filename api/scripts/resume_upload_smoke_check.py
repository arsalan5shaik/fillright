"""Milestone 4 acceptance check: uploads a synthetic sample resume (as two
different throwaway users) through the running FastAPI /resumes/upload
endpoint, confirms parsed JSON + llm_usage_log look right, and confirms the
new PostgREST-forwarding write path still enforces RLS (user A can't see
user B's resume_profiles row). Cleans up both test users afterward.

Requires the API server running locally (uvicorn app.main:app --port 8000).

Usage:
    uv run python scripts/resume_upload_smoke_check.py
"""

import io
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))

import httpx
from docx import Document

from app.core.config import get_settings
from app.db.session import get_connection

SAMPLE_RESUME_TEXT = """Jordan Rivera
jordan.rivera@example.invalid | (555) 123-4567 | linkedin.com/in/jordanrivera

Work Experience

Acme Corp — Senior Backend Engineer
Jan 2021 - Present
Led migration of the payments service to a distributed event-driven architecture.
Built internal tooling in Python and PostgreSQL used by 40+ engineers.

Globex Inc — Software Engineer
Jun 2018 - Dec 2020
Developed REST APIs in Django serving 2M+ daily requests.

Education

State University — B.S. Computer Science
Aug 2014 - May 2018

Skills
Python, PostgreSQL, Distributed Systems, Django, REST APIs
"""


def build_sample_docx() -> bytes:
    doc = Document()
    for line in SAMPLE_RESUME_TEXT.splitlines():
        doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def create_user_and_token(base_url: str, admin_headers: dict, publishable_key: str) -> tuple[str, str]:
    tag = uuid.uuid4().hex[:8]
    email = f"resume-upload-{tag}@example.invalid"
    password = uuid.uuid4().hex

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
    return user_id, token_resp.json()["access_token"]


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

    resume_bytes = build_sample_docx()
    user_ids: list[str] = []

    try:
        user_a_id, token_a = create_user_and_token(base_url, admin_headers, publishable_key)
        user_ids.append(user_a_id)
        user_b_id, token_b = create_user_and_token(base_url, admin_headers, publishable_key)
        user_ids.append(user_b_id)
        print(f"Created test users: a={user_a_id} b={user_b_id}")

        upload_resp = httpx.post(
            "http://127.0.0.1:8000/resumes/upload",
            headers={"Authorization": f"Bearer {token_a}"},
            files={
                "file": (
                    "resume.docx",
                    resume_bytes,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
            data={"profile_name": "SWE Resume"},
            timeout=60,
        )
        print(f"POST /resumes/upload -> status={upload_resp.status_code}")
        upload_resp.raise_for_status()
        body = upload_resp.json()
        print(f"Parsed resume: {body['parsed']}")

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select provider, model, endpoint, input_tokens, output_tokens
                    from llm_usage_log
                    where endpoint = 'resume_parsing'
                    order by created_at desc
                    limit 1;
                    """
                )
                print(f"Latest resume_parsing usage log row: {cur.fetchone()}")

        # RLS proof through the new PostgREST-forwarding write path: user B
        # should see zero resume_profiles rows (only user A uploaded one).
        b_headers = {
            "Authorization": f"Bearer {token_b}",
            "apikey": service_key,
        }
        b_resp = httpx.get(
            f"{base_url}/rest/v1/resume_profiles",
            headers=b_headers,
            params={"select": "id,profile_name"},
            timeout=10,
        )
        b_resp.raise_for_status()
        print(f"resume_profiles visible to user B: {b_resp.json()}")

        parsed_ok = body["parsed"]["contact"]["full_name"] == "Jordan Rivera"
        rls_ok = b_resp.json() == []
        print("PASS" if parsed_ok and rls_ok else "FAIL", "- parsed correctly and RLS isolation holds")

    finally:
        for uid in user_ids:
            try:
                httpx.delete(f"{base_url}/auth/v1/admin/users/{uid}", headers=admin_headers, timeout=10)
                print(f"Cleaned up test user {uid}")
            except Exception as exc:  # noqa: BLE001
                print(f"WARNING: failed to delete test user {uid}: {exc}")


if __name__ == "__main__":
    main()
