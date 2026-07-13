"""Milestone 15 acceptance check: full dry run from JD scan through
resume-file-attach data path and the website's application-history/status
flow, as a real throwaway user. No browser-automation tool available, so
this drives the exact same Supabase/API calls the extension's
GET_TAILORED_RESUME_FILE handler and the website's Applications page/status
dropdown make, rather than literally clicking through either UI.

Requires the API server running locally (uvicorn app.main:app --port 8000).

Usage:
    uv run python scripts/history_and_file_attach_smoke_check.py
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

SAMPLE_RESUME_TEXT = """Riley Chen
riley.chen@example.invalid | (555) 999-0000

Work Experience

Cascade Robotics — Firmware Engineer
Jan 2021 - Present
Wrote embedded C firmware for motor control systems.

Education

Cascade Institute — B.S. Electrical Engineering
Aug 2017 - May 2021

Skills
C, Embedded Systems, RTOS
"""

SAMPLE_JD = """
Firmware Engineer - Cascade Robotics Labs

We need a Firmware Engineer with strong C and embedded systems experience
for our motor control team. Full-time, onsite in Denver, CO.
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
    email = f"history-{tag}@example.invalid"
    password = uuid.uuid4().hex
    user_id = None
    storage_paths: list[str] = []

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
        rest_headers = {"Authorization": f"Bearer {access_token}", "apikey": service_key}

        # --- Full dry run: upload -> analyze -> tailor -> cover letter ---
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
            data={"profile_name": "Firmware Resume"},
            timeout=60,
        )
        upload_resp.raise_for_status()
        resume_profile_id = upload_resp.json()["id"]

        analyze_resp = httpx.post(
            "http://127.0.0.1:8000/applications/analyze",
            headers=api_headers,
            json={
                "company": "Cascade Robotics Labs",
                "requisition_id": f"R-{tag}",
                "job_title": "Firmware Engineer",
                "jd_text": SAMPLE_JD,
                "resume_profile_id": resume_profile_id,
            },
            timeout=60,
        )
        analyze_resp.raise_for_status()
        application_id = analyze_resp.json()["id"]

        tailor_resp = httpx.post(
            f"http://127.0.0.1:8000/applications/{application_id}/tailor-resume", headers=api_headers, json={}, timeout=90
        )
        tailor_resp.raise_for_status()

        letter_resp = httpx.post(
            f"http://127.0.0.1:8000/applications/{application_id}/cover-letter", headers=api_headers, json={}, timeout=60
        )
        letter_resp.raise_for_status()
        print(f"Application {application_id} fully prepared (resume + cover letter tailored).")

        # --- Simulate extension's GET_TAILORED_RESUME_FILE (apiClient.ts) ---
        recent_resp = httpx.get(
            f"{base_url}/rest/v1/applications",
            headers=rest_headers,
            params={
                "select": "tailored_resume_url",
                "tailored_resume_url": "not.is.null",
                "order": "created_at.desc",
                "limit": "1",
            },
            timeout=10,
        )
        recent_resp.raise_for_status()
        tailored_path = recent_resp.json()[0]["tailored_resume_url"]
        storage_paths.append(tailored_path)

        sign_resp = httpx.post(
            f"{base_url}/storage/v1/object/sign/resumes/{tailored_path}",
            headers=rest_headers,
            json={"expiresIn": 3600},
            timeout=10,
        )
        sign_resp.raise_for_status()
        signed_url = f"{base_url}/storage/v1{sign_resp.json()['signedURL']}"
        pdf_resp = httpx.get(signed_url, timeout=15)
        pdf_resp.raise_for_status()
        file_attach_ok = pdf_resp.content[:4] == b"%PDF"
        print(f"Extension-path resume fetch -> is_pdf={file_attach_ok} bytes={len(pdf_resp.content)}")

        # --- Simulate website's Applications page (list + signed doc links) ---
        list_resp = httpx.get(
            f"{base_url}/rest/v1/applications",
            headers=rest_headers,
            params={
                "select": "id,company,job_title,status,tailored_resume_url,cover_letter_url",
                "order": "created_at.desc",
            },
            timeout=10,
        )
        list_resp.raise_for_status()
        rows = list_resp.json()
        this_row = next(r for r in rows if r["id"] == application_id)
        print(f"Website history list row: {this_row}")
        cover_letter_path = this_row["cover_letter_url"]
        storage_paths.append(cover_letter_path)

        cl_sign_resp = httpx.post(
            f"{base_url}/storage/v1/object/sign/resumes/{cover_letter_path}",
            headers=rest_headers,
            json={"expiresIn": 3600},
            timeout=10,
        )
        cl_sign_resp.raise_for_status()
        cl_signed_url = f"{base_url}/storage/v1{cl_sign_resp.json()['signedURL']}"
        cl_pdf_resp = httpx.get(cl_signed_url, timeout=15)
        cl_pdf_resp.raise_for_status()
        cover_letter_downloadable = cl_pdf_resp.content[:4] == b"%PDF"

        default_status_ok = this_row["status"] == "applied"

        # --- Simulate the status dropdown (website's direct Supabase update) ---
        patch_resp = httpx.patch(
            f"{base_url}/rest/v1/applications",
            headers={**rest_headers, "Prefer": "return=representation"},
            params={"id": f"eq.{application_id}"},
            json={"status": "interviewing"},
            timeout=10,
        )
        patch_resp.raise_for_status()

        reread_resp = httpx.get(
            f"{base_url}/rest/v1/applications",
            headers=rest_headers,
            params={"select": "status", "id": f"eq.{application_id}"},
            timeout=10,
        )
        reread_resp.raise_for_status()
        status_update_ok = reread_resp.json()[0]["status"] == "interviewing"
        print(f"Status after update: {reread_resp.json()[0]['status']}")

        ok = file_attach_ok and cover_letter_downloadable and default_status_ok and status_update_ok
        print(
            "PASS" if ok else "FAIL",
            "- resume file fetchable for attach, history list populated, docs downloadable, status editable",
        )

    finally:
        for path in storage_paths:
            try:
                httpx.request("DELETE", f"{base_url}/storage/v1/object/resumes/{path}", headers=admin_headers, timeout=10)
            except Exception:  # noqa: BLE001
                pass
        if user_id:
            httpx.delete(f"{base_url}/auth/v1/admin/users/{user_id}", headers=admin_headers, timeout=10)
            print(f"Cleaned up test user {user_id}")


if __name__ == "__main__":
    main()
