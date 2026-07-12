"""Milestone 7 acceptance check: analyzes a sample JD as a real throwaway
user, confirms structured keywords/location/seniority extraction, then POSTs
the exact same (company, requisition_id) again and confirms it's flagged a
duplicate with the same application id and zero new llm_usage_log rows for
the keyword_extraction endpoint.

Requires the API server running locally (uvicorn app.main:app --port 8000).

Usage:
    uv run python scripts/jd_analysis_smoke_check.py
"""

import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))

import httpx

from app.core.config import get_settings
from app.db.session import get_connection

SAMPLE_JD = """
Senior Backend Engineer - Acme Corp

We are looking for a Senior Backend Engineer to join our platform team.

Requirements:
- 5+ years of experience with Python
- Strong knowledge of PostgreSQL and distributed systems
- Experience with Kubernetes is a plus

This is a hybrid role based in Austin, Texas (3 days/week in office).
Full-time position. Some domestic travel (~10%) may be required.
"""


def _load_web_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip()
    return env


def count_usage_rows(user_id: str) -> int:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select count(*) from llm_usage_log where endpoint = 'keyword_extraction' and user_id = %s",
                (user_id,),
            )
            return cur.fetchone()[0]


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
    email = f"jd-analysis-{tag}@example.invalid"
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

        payload = {
            "company": "Acme Corp",
            "requisition_id": "R-12345",
            "job_title": "Senior Backend Engineer",
            "job_url": "https://acme.example.invalid/jobs/R-12345",
            "jd_text": SAMPLE_JD,
        }

        usage_before = count_usage_rows(user_id)
        r1 = httpx.post(
            "http://127.0.0.1:8000/applications/analyze", headers=api_headers, json=payload, timeout=60
        )
        r1.raise_for_status()
        body1 = r1.json()
        usage_after_first = count_usage_rows(user_id)
        print(f"First analyze -> is_duplicate={body1['is_duplicate']}")
        print(f"  jd_analysis={body1['jd_analysis']}")
        print(f"  llm_usage_log rows (keyword_extraction): before={usage_before} after={usage_after_first}")

        r2 = httpx.post(
            "http://127.0.0.1:8000/applications/analyze", headers=api_headers, json=payload, timeout=60
        )
        r2.raise_for_status()
        body2 = r2.json()
        usage_after_second = count_usage_rows(user_id)
        print(f"Second analyze (same company+req_id) -> is_duplicate={body2['is_duplicate']}")
        print(f"  llm_usage_log rows after second call: {usage_after_second}")

        analysis = body1["jd_analysis"]
        extracted_python = any(k["term"].lower() == "python" for k in analysis["keywords"])
        location_ok = any(
            (loc.get("city") or "").lower() == "austin" and loc.get("workplace_type") == "hybrid"
            for loc in analysis["locations"]
        )
        no_new_calls = usage_after_second == usage_after_first
        same_id = body1["id"] == body2["id"]
        dup_flagged = body1["is_duplicate"] is False and body2["is_duplicate"] is True

        ok = extracted_python and location_ok and no_new_calls and same_id and dup_flagged
        print("PASS" if ok else "FAIL", "- structured extraction correct, duplicate detected, zero new LLM calls")

    finally:
        if user_id:
            httpx.delete(f"{base_url}/auth/v1/admin/users/{user_id}", headers=admin_headers, timeout=10)
            print(f"Cleaned up test user {user_id}")


if __name__ == "__main__":
    main()
