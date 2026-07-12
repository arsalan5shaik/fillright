"""Milestone 5 acceptance check: exercises the exact data-path the website's
resume pages use (list via PostgREST select, upload via FastAPI, edit via
PostgREST update, reload via PostgREST select again) as a real throwaway
user, confirming an edit actually persists. This is not a browser-driven
test (no browser automation tool available) - it drives the same
Supabase/API calls the pages themselves make.

Requires the API server running locally (uvicorn app.main:app --port 8000).

Usage:
    uv run python scripts/resume_review_smoke_check.py
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

SAMPLE_RESUME_TEXT = """Taylor Chen
taylor.chen@example.invalid | (555) 987-6543

Work Experience

Initech — Data Engineer
Mar 2020 - Present
Built ETL pipelines processing 500GB/day.

Education

Tech Institute — B.S. Information Systems
Aug 2016 - May 2020

Skills
Python, Airflow, SQL
"""


def build_sample_docx() -> bytes:
    doc = Document()
    for line in SAMPLE_RESUME_TEXT.splitlines():
        doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


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
    email = f"resume-review-{tag}@example.invalid"
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
        rest_headers = {"Authorization": f"Bearer {access_token}", "apikey": service_key}

        # 1) Upload (what UploadForm.tsx does)
        upload_resp = httpx.post(
            "http://127.0.0.1:8000/resumes/upload",
            headers={"Authorization": f"Bearer {access_token}"},
            files={
                "file": (
                    "resume.docx",
                    build_sample_docx(),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
            data={"profile_name": "Data Engineer Resume"},
            timeout=60,
        )
        upload_resp.raise_for_status()
        resume_id = upload_resp.json()["id"]
        print(f"Uploaded resume_profiles row {resume_id}")

        # 2) List (what /resume/page.tsx's server-side select does)
        list_resp = httpx.get(
            f"{base_url}/rest/v1/resume_profiles",
            headers=rest_headers,
            params={"select": "id,profile_name,is_default,updated_at"},
            timeout=10,
        )
        list_resp.raise_for_status()
        print(f"Listed resumes: {list_resp.json()}")
        assert any(r["id"] == resume_id for r in list_resp.json()), "uploaded resume missing from list"

        # 3) Edit + save (what ResumeEditor.tsx's handleSave does)
        get_resp = httpx.get(
            f"{base_url}/rest/v1/resume_profiles",
            headers=rest_headers,
            params={"select": "parsed_json", "id": f"eq.{resume_id}"},
            timeout=10,
        )
        get_resp.raise_for_status()
        parsed = get_resp.json()[0]["parsed_json"]
        original_name = parsed["contact"]["full_name"]
        parsed["contact"]["full_name"] = "Taylor Chen-Rodriguez"

        patch_resp = httpx.patch(
            f"{base_url}/rest/v1/resume_profiles",
            headers={**rest_headers, "Prefer": "return=representation"},
            params={"id": f"eq.{resume_id}"},
            json={"parsed_json": parsed},
            timeout=10,
        )
        patch_resp.raise_for_status()
        print(f"Edited full_name: '{original_name}' -> 'Taylor Chen-Rodriguez'")

        # 4) Reload (what visiting /resume/[id] again does)
        reload_resp = httpx.get(
            f"{base_url}/rest/v1/resume_profiles",
            headers=rest_headers,
            params={"select": "parsed_json", "id": f"eq.{resume_id}"},
            timeout=10,
        )
        reload_resp.raise_for_status()
        reloaded_name = reload_resp.json()[0]["parsed_json"]["contact"]["full_name"]
        print(f"After reload, full_name = '{reloaded_name}'")

        ok = reloaded_name == "Taylor Chen-Rodriguez"
        print("PASS: edit persisted across reload" if ok else "FAIL")

    finally:
        if user_id:
            httpx.delete(f"{base_url}/auth/v1/admin/users/{user_id}", headers=admin_headers, timeout=10)
            print(f"Cleaned up test user {user_id}")


if __name__ == "__main__":
    main()
