"""Milestone 12 acceptance check: runs the exact data a real Workday job
posting page's content script would extract (fetched and verified against
a live usbank.wd1.myworkdayjobs.com posting) through the full backend
pipeline the extension's background worker calls: analyze -> tailor-resume
-> cover-letter. No browser-automation tool is available in this
environment, so this is the strongest available proxy for "visit a real
Workday posting, trigger a scan, confirm a fully-populated applications row"
without literally driving a browser.

Usage:
    uv run python scripts/workday_e2e_smoke_check.py /path/to/workday_jobposting.json
"""

import io
import json
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))

import httpx
from docx import Document

from app.core.config import get_settings

SAMPLE_RESUME_TEXT = """Jamie Alvarez
jamie.alvarez@example.invalid | (555) 777-8888

Work Experience

Meridian Software — Software Engineer
Jan 2023 - Present
Built REST APIs and React/Next.js frontends for internal tooling.
Worked with GraphQL, Redux, and CI/CD pipelines using Jenkins and Git.

Education

Delta State University — B.S. Computer Science
Aug 2019 - May 2023

Skills
JavaScript, React, Next.js, GraphQL, Node.js, HTML5, CSS3, Git
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


def clean_company_name(raw: str) -> str:
    import re

    return re.sub(r"^\d+\s+", "", raw).strip()


def format_location_line(jsonld: dict) -> str | None:
    """Mirrors extension/src/content/workday/detect.ts's formatLocationLine -
    jobLocation is a separate JSON-LD field from description, and the real
    posting's description text never restates "Earth City, MO" anywhere, so
    the JD-analysis LLM call gets nothing to work with unless this is
    surfaced explicitly."""
    address = (jsonld.get("jobLocation") or {}).get("address") or {}
    parts = [address.get("addressLocality"), address.get("addressRegion"), address.get("addressCountry")]
    parts = [p for p in parts if p]
    return f"Job Location: {', '.join(parts)}" if parts else None


def main() -> None:
    jobposting_path = Path(sys.argv[1])
    jsonld = json.loads(jobposting_path.read_text(encoding="utf-8"))

    location_line = format_location_line(jsonld)
    jd_text = f"{location_line}\n\n{jsonld['description']}" if location_line else jsonld["description"]

    posting = {
        "company": clean_company_name(jsonld["hiringOrganization"]["name"]),
        "requisition_id": jsonld["identifier"]["value"],
        "job_title": jsonld["title"],
        "job_url": "https://usbank.wd1.myworkdayjobs.com/US_Bank_Careers/job/Earth-City-MO/Software-Engineer-1--Backend-UI-and-AI-_2026-0018795",
        "jd_text": jd_text,
    }
    print(f"Scraped posting: company={posting['company']!r} req_id={posting['requisition_id']!r}")
    print(f"  job_title={posting['job_title']!r} jd_text_len={len(posting['jd_text'])}")

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
    email = f"workday-e2e-{tag}@example.invalid"
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

        # 1) Analyze (what the background worker does on first scan)
        analyze_resp = httpx.post(
            "http://127.0.0.1:8000/applications/analyze",
            headers=api_headers,
            json={**posting, "resume_profile_id": resume_profile_id},
            timeout=60,
        )
        analyze_resp.raise_for_status()
        app_body = analyze_resp.json()
        application_id = app_body["id"]
        # This real JD frames its whole stack under "Preferred Skills &
        # Qualifications" / "Preferred Technologies" - not a "Requirements"
        # section - so correct model behavior is to mark these nice-to-have,
        # not required. Check across both buckets rather than assuming
        # every JD has a required list.
        all_keywords = [k["term"] for k in app_body["jd_analysis"]["keywords"]]
        print(f"Analyzed -> application_id={application_id} is_duplicate={app_body['is_duplicate']}")
        print(f"  keywords extracted: {app_body['jd_analysis']['keywords']}")
        print(f"  locations: {app_body['jd_analysis']['locations']}")

        # 2) Re-scan the identical posting (simulates revisiting/reloading the page)
        redup_resp = httpx.post(
            "http://127.0.0.1:8000/applications/analyze",
            headers=api_headers,
            json={**posting, "resume_profile_id": resume_profile_id},
            timeout=60,
        )
        redup_resp.raise_for_status()
        is_duplicate_on_revisit = redup_resp.json()["is_duplicate"]
        print(f"Re-scan same posting -> is_duplicate={is_duplicate_on_revisit}")

        # 3) Tailor resume
        tailor_resp = httpx.post(
            f"http://127.0.0.1:8000/applications/{application_id}/tailor-resume",
            headers=api_headers,
            json={},
            timeout=90,
        )
        tailor_resp.raise_for_status()
        tailor_body = tailor_resp.json()
        print(f"Tailored resume summary: {tailor_body['tailored_resume']['summary']}")
        storage_paths.append(f"{user_id}/{application_id}.pdf")

        # 4) Cover letter
        letter_resp = httpx.post(
            f"http://127.0.0.1:8000/applications/{application_id}/cover-letter",
            headers=api_headers,
            json={},
            timeout=60,
        )
        letter_resp.raise_for_status()
        letter_body = letter_resp.json()
        print(f"Cover letter references company: {posting['company'] in letter_body['cover_letter_text']}")
        storage_paths.append(f"{user_id}/{application_id}-cover-letter.pdf")

        # 5) Confirm the applications row is fully populated
        db_check = httpx.get(
            f"{base_url}/rest/v1/applications",
            headers={"Authorization": f"Bearer {access_token}", "apikey": service_key},
            params={
                "select": "id,company,requisition_id,job_title,tailored_resume_url,cover_letter_url,status",
                "id": f"eq.{application_id}",
            },
            timeout=10,
        )
        db_check.raise_for_status()
        row = db_check.json()[0]
        print(f"Final applications row: {row}")

        fully_populated = all(
            [
                row["company"] == posting["company"],
                row["requisition_id"] == posting["requisition_id"],
                row["tailored_resume_url"],
                row["cover_letter_url"],
                row["status"] == "applied",
            ]
        )
        keywords_reasonable = any(
            k.lower() in ("react", "reactjs", "next.js", "graphql", "javascript") for k in all_keywords
        )
        location_extracted = any(
            (loc.get("city") or loc.get("state") or loc.get("country")) for loc in app_body["jd_analysis"]["locations"]
        )

        ok = (
            fully_populated
            and keywords_reasonable
            and location_extracted
            and not app_body["is_duplicate"]
            and is_duplicate_on_revisit
        )
        print("PASS" if ok else "FAIL", "- real Workday posting scanned end-to-end, applications row fully populated")

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
