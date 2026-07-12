import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import CurrentUser, get_current_user
from app.db.postgrest import user_scoped_client
from app.schemas.applications import AnalyzeJDRequest, ApplicationOut
from app.schemas.jd_analysis import JDAnalysis
from app.services.llm.client import call_structured

router = APIRouter(prefix="/applications", tags=["applications"])

_SELECT_FIELDS = "id,company,requisition_id,job_title,job_url,jd_analysis_json"


def _find_existing(client: httpx.Client, company: str, requisition_id: str) -> dict | None:
    resp = client.get(
        "/applications",
        params={
            "select": _SELECT_FIELDS,
            "company": f"eq.{company}",
            "requisition_id": f"eq.{requisition_id}",
        },
    )
    resp.raise_for_status()
    rows = resp.json()
    return rows[0] if rows else None


def _to_output(row: dict, *, is_duplicate: bool) -> ApplicationOut:
    return ApplicationOut(
        id=row["id"],
        company=row["company"],
        requisition_id=row["requisition_id"],
        job_title=row["job_title"],
        job_url=row["job_url"],
        jd_analysis=JDAnalysis(**row["jd_analysis_json"]),
        is_duplicate=is_duplicate,
    )


@router.post("/analyze", response_model=ApplicationOut)
def analyze_jd(body: AnalyzeJDRequest, user: CurrentUser = Depends(get_current_user)) -> ApplicationOut:
    with user_scoped_client(user.access_token) as client:
        if body.requisition_id:
            existing = _find_existing(client, body.company, body.requisition_id)
            if existing:
                return _to_output(existing, is_duplicate=True)

        analysis = call_structured(
            "keyword_extraction",
            "Analyze the following job description and extract structured data: a "
            "ranked list of skill/technology keywords, each marked required=true if "
            "the JD treats it as a must-have or required=false if it's nice-to-have; "
            "the seniority level (e.g. Senior, Mid, Entry, Staff) if stated or clearly "
            "implied; every distinct work location mentioned (city/state/country and "
            "whether remote/hybrid/onsite); employment type; and any travel or "
            "security clearance requirements. Leave fields empty/null rather than "
            "guessing if the JD doesn't specify them.\n\n" + body.jd_text,
            JDAnalysis,
            user_id=user.id,
        )

        insert_resp = client.post(
            "/applications",
            headers={"Prefer": "return=representation"},
            json={
                "user_id": user.id,
                "resume_profile_id": body.resume_profile_id,
                "company": body.company,
                "requisition_id": body.requisition_id,
                "job_title": body.job_title,
                "job_url": body.job_url,
                "jd_text": body.jd_text,
                "jd_analysis_json": analysis.model_dump(),
            },
        )

        if insert_resp.status_code == 409 and body.requisition_id:
            # Race: another request inserted the same (company, requisition_id)
            # between our check and our insert.
            existing = _find_existing(client, body.company, body.requisition_id)
            if existing:
                return _to_output(existing, is_duplicate=True)

        if insert_resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Failed to save application: {insert_resp.text}")

        row = insert_resp.json()[0]

    return ApplicationOut(
        id=row["id"],
        company=row["company"],
        requisition_id=row["requisition_id"],
        job_title=row["job_title"],
        job_url=row["job_url"],
        jd_analysis=analysis,
        is_duplicate=False,
    )
