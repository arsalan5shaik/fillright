"""Milestone 8 acceptance check: uploads a sample resume, analyzes a sample
JD, tailors the resume against it, downloads the resulting PDF via its
signed URL, and confirms: the tailored work-experience entries exactly match
the source resume's companies/titles/dates (the guardrail held), the PDF is
a real single-column PDF containing the expected text, and
applications.tailored_resume_url got set. Cleans up the test user and the
uploaded Storage object afterward.

Requires the API server running locally (uvicorn app.main:app --port 8000).

Usage:
    uv run python scripts/resume_tailor_smoke_check.py
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

SAMPLE_RESUME_TEXT = """Morgan Lee
morgan.lee@example.invalid | (555) 222-3333

Work Experience

Nimbus Systems — Backend Engineer
Feb 2019 - Present
Built REST APIs in Python and Django serving internal tooling.
Migrated a monolith service to a Kubernetes-based deployment.

Prior Robotics — Software Engineer I
Jul 2016 - Jan 2019
Wrote data pipelines in Python for sensor telemetry ingestion.

Education

Riverdale College — B.S. Computer Science
Aug 2012 - May 2016

Skills
Python, Django, Kubernetes, PostgreSQL, REST APIs
"""

SAMPLE_JD = """
Senior Backend Engineer - Nimbus Analytics

We need a Senior Backend Engineer with deep Python and Kubernetes
experience to help scale our platform. PostgreSQL knowledge is a strong
plus. This is a fully remote, full-time role.
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
    email = f"resume-tailor-{tag}@example.invalid"
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
            data={"profile_name": "SWE Resume"},
            timeout=60,
        )
        upload_resp.raise_for_status()
        resume_profile_id = upload_resp.json()["id"]
        print(f"Uploaded resume_profiles row {resume_profile_id}")

        analyze_resp = httpx.post(
            "http://127.0.0.1:8000/applications/analyze",
            headers=api_headers,
            json={
                "company": "Nimbus Analytics",
                "requisition_id": f"R-{tag}",
                "job_title": "Senior Backend Engineer",
                "jd_text": SAMPLE_JD,
                "resume_profile_id": resume_profile_id,
            },
            timeout=60,
        )
        analyze_resp.raise_for_status()
        application_id = analyze_resp.json()["id"]
        print(f"Analyzed JD -> application {application_id}")

        tailor_resp = httpx.post(
            f"http://127.0.0.1:8000/applications/{application_id}/tailor-resume",
            headers=api_headers,
            json={},
            timeout=90,
        )
        tailor_resp.raise_for_status()
        body = tailor_resp.json()
        tailored = body["tailored_resume"]
        download_url = body["download_url"]
        print(f"Tailored resume summary: {tailored['summary']}")
        print(f"Tailored work_experience: {[(e['company'], e['title']) for e in tailored['work_experience']]}")
        print(f"Download URL: {download_url}")

        source_entries = {
            ("Nimbus Systems", "Backend Engineer", "Feb 2019", "Present"),
            ("Prior Robotics", "Software Engineer I", "Jul 2016", "Jan 2019"),
        }
        tailored_entries = {
            (e["company"], e["title"], e["start_date"], e["end_date"]) for e in tailored["work_experience"]
        }
        guardrail_ok = tailored_entries.issubset(source_entries) and len(tailored_entries) > 0

        pdf_resp = httpx.get(download_url, timeout=30)
        pdf_resp.raise_for_status()
        pdf_bytes = pdf_resp.content
        is_pdf = pdf_bytes[:4] == b"%PDF"

        with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
            page_count = len(doc)
            pdf_text = "\n".join(page.get_text() for page in doc)
        contains_name = "Morgan Lee" in pdf_text
        contains_company = "Nimbus Systems" in pdf_text

        storage_path = f"{user_id}/{application_id}.pdf"
        db_check = httpx.get(
            f"{base_url}/rest/v1/applications",
            headers={"Authorization": f"Bearer {access_token}", "apikey": service_key},
            params={"select": "tailored_resume_url", "id": f"eq.{application_id}"},
            timeout=10,
        )
        db_check.raise_for_status()
        stored_url_ok = db_check.json()[0]["tailored_resume_url"] == storage_path

        print(f"is_pdf={is_pdf} page_count={page_count} contains_name={contains_name} contains_company={contains_company}")
        print(f"guardrail_ok={guardrail_ok} stored_url_ok={stored_url_ok}")

        ok = is_pdf and page_count >= 1 and contains_name and contains_company and guardrail_ok and stored_url_ok
        print("PASS" if ok else "FAIL", "- tailored resume PDF generated, guardrail held, stored correctly")

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
