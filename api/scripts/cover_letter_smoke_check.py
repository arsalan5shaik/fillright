"""Milestone 9 acceptance check: uploads a resume, analyzes a JD, generates
a cover letter, downloads the resulting PDF via its signed URL, and confirms
the letter text references the correct company name and at least 2-3 of the
JD's required keywords verbatim. Cleans up the test user and Storage object
afterward.

Requires the API server running locally (uvicorn app.main:app --port 8000).

Usage:
    uv run python scripts/cover_letter_smoke_check.py
"""

import io
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))

import fitz
import httpx
from docx import Document

from app.core.config import get_settings

SAMPLE_RESUME_TEXT = """Casey Kim
casey.kim@example.invalid | (555) 444-5555

Work Experience

Vector Health — Data Engineer
Mar 2020 - Present
Built ETL pipelines in Python and Airflow processing 1TB/day of claims data.
Designed a PostgreSQL warehouse schema used by the analytics team.

Education

Lakeside University — B.S. Data Science
Aug 2015 - May 2019

Skills
Python, Airflow, PostgreSQL, ETL, SQL
"""

SAMPLE_JD = """
Senior Data Engineer - Vector Analytics Group

We're looking for a Senior Data Engineer with strong Python and Airflow
experience to build and scale our ETL pipelines. Familiarity with PostgreSQL
is required. This is a full-time, remote-friendly role.
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
    email = f"cover-letter-{tag}@example.invalid"
    password = uuid.uuid4().hex
    user_id = None
    storage_path = None

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

        upload_resp = httpx.post(
            "http://127.0.0.1:8000/resumes/upload",
            headers=api_headers,
            files={
                "file": (
                    "resume.docx",
                    build_sample_docx(),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
            data={"profile_name": "Data Resume"},
            timeout=60,
        )
        upload_resp.raise_for_status()
        resume_profile_id = upload_resp.json()["id"]

        analyze_resp = httpx.post(
            "http://127.0.0.1:8000/applications/analyze",
            headers=api_headers,
            json={
                "company": "Vector Analytics Group",
                "requisition_id": f"R-{tag}",
                "job_title": "Senior Data Engineer",
                "jd_text": SAMPLE_JD,
                "resume_profile_id": resume_profile_id,
            },
            timeout=60,
        )
        analyze_resp.raise_for_status()
        application_id = analyze_resp.json()["id"]
        required_keywords = [k["term"] for k in analyze_resp.json()["jd_analysis"]["keywords"] if k["required"]]
        print(f"Application {application_id}, required keywords: {required_keywords}")

        letter_resp = httpx.post(
            f"http://127.0.0.1:8000/applications/{application_id}/cover-letter",
            headers=api_headers,
            json={},
            timeout=60,
        )
        letter_resp.raise_for_status()
        body = letter_resp.json()
        letter_text = body["cover_letter_text"]
        download_url = body["download_url"]
        print(f"--- Cover letter text ---\n{letter_text}\n--- end ---")

        contains_company = "Vector Analytics Group" in letter_text
        keyword_hits = [k for k in required_keywords if k.lower() in letter_text.lower()]
        print(f"contains_company={contains_company} keyword_hits={keyword_hits}")

        pdf_resp = httpx.get(download_url, timeout=30)
        pdf_resp.raise_for_status()
        pdf_bytes = pdf_resp.content
        is_pdf = pdf_bytes[:4] == b"%PDF"
        with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
            page_count = len(doc)
            pdf_text = "\n".join(page.get_text() for page in doc)
        pdf_contains_name = "Casey Kim" in pdf_text

        storage_path = f"{user_id}/{application_id}-cover-letter.pdf"
        db_check = httpx.get(
            f"{base_url}/rest/v1/applications",
            headers={"Authorization": f"Bearer {access_token}", "apikey": service_key},
            params={"select": "cover_letter_text,cover_letter_url", "id": f"eq.{application_id}"},
            timeout=10,
        )
        db_check.raise_for_status()
        stored = db_check.json()[0]
        stored_ok = stored["cover_letter_url"] == storage_path and stored["cover_letter_text"] == letter_text

        print(f"is_pdf={is_pdf} page_count={page_count} pdf_contains_name={pdf_contains_name} stored_ok={stored_ok}")

        ok = contains_company and len(keyword_hits) >= 2 and is_pdf and pdf_contains_name and stored_ok
        print("PASS" if ok else "FAIL", "- cover letter references company + JD keywords, PDF valid, stored correctly")

    finally:
        if storage_path:
            try:
                httpx.request(
                    "DELETE",
                    f"{base_url}/storage/v1/object/resumes/{storage_path}",
                    headers=admin_headers,
                    timeout=10,
                )
                print(f"Cleaned up storage object {storage_path}")
            except Exception as exc:  # noqa: BLE001
                print(f"WARNING: failed to delete storage object: {exc}")
        if user_id:
            httpx.delete(f"{base_url}/auth/v1/admin/users/{user_id}", headers=admin_headers, timeout=10)
            print(f"Cleaned up test user {user_id}")


if __name__ == "__main__":
    main()
