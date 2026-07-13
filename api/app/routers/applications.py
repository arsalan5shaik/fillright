import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import CurrentUser, get_current_user
from app.db.postgrest import user_scoped_client
from app.db.storage import create_signed_url, upload_object
from app.schemas.applications import (
    AnalyzeJDRequest,
    ApplicationOut,
    CoverLetterRequest,
    CoverLetterResponse,
    TailorResumeRequest,
    TailorResumeResponse,
)
from app.schemas.jd_analysis import JDAnalysis
from app.schemas.resume import ParsedResume
from app.services.cover_letter import generate_cover_letter
from app.services.llm.client import call_structured
from app.services.pdf_render import render_cover_letter_pdf, render_resume_pdf
from app.services.resume_tailor import tailor_resume

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


def _load_application_and_resume(
    client: httpx.Client,
    application_id: str,
    resume_profile_id_override: str | None,
    *,
    extra_app_fields: str = "",
) -> tuple[dict, ParsedResume, str]:
    """Shared by tailor-resume and cover-letter: fetch the application row,
    resolve which resume profile to use (request override, else the one set
    on the application), and fetch that resume's parsed_json."""
    app_resp = client.get(
        "/applications",
        params={
            "select": f"id,resume_profile_id,jd_analysis_json{extra_app_fields}",
            "id": f"eq.{application_id}",
        },
    )
    app_resp.raise_for_status()
    app_rows = app_resp.json()
    if not app_rows:
        raise HTTPException(status_code=404, detail="Application not found")
    app_row = app_rows[0]

    resume_profile_id = resume_profile_id_override or app_row["resume_profile_id"]
    if not resume_profile_id:
        raise HTTPException(status_code=400, detail="No resume_profile_id provided or set on the application")

    resume_resp = client.get(
        "/resume_profiles",
        params={"select": "id,parsed_json", "id": f"eq.{resume_profile_id}"},
    )
    resume_resp.raise_for_status()
    resume_rows = resume_resp.json()
    if not resume_rows:
        raise HTTPException(status_code=404, detail="Resume profile not found")

    return app_row, ParsedResume(**resume_rows[0]["parsed_json"]), resume_profile_id


@router.post("/{application_id}/tailor-resume", response_model=TailorResumeResponse)
def tailor_resume_endpoint(
    application_id: str,
    body: TailorResumeRequest,
    user: CurrentUser = Depends(get_current_user),
) -> TailorResumeResponse:
    with user_scoped_client(user.access_token) as client:
        app_row, source, resume_profile_id = _load_application_and_resume(
            client, application_id, body.resume_profile_id
        )
        jd_analysis = JDAnalysis(**app_row["jd_analysis_json"])

        tailored = tailor_resume(source, jd_analysis, user_id=user.id)
        pdf_bytes = render_resume_pdf(tailored)

        storage_path = f"{user.id}/{application_id}.pdf"
        upload_object(user.access_token, "resumes", storage_path, pdf_bytes, "application/pdf")
        download_url = create_signed_url(user.access_token, "resumes", storage_path)

        update_resp = client.patch(
            "/applications",
            params={"id": f"eq.{application_id}"},
            headers={"Prefer": "return=representation"},
            json={
                "resume_profile_id": resume_profile_id,
                "tailored_resume_url": storage_path,
                "tailored_resume_json": tailored.model_dump(),
            },
        )
        if update_resp.status_code >= 400:
            raise HTTPException(
                status_code=502, detail=f"Failed to update application: {update_resp.text}"
            )

    return TailorResumeResponse(
        application_id=application_id, tailored_resume=tailored, download_url=download_url
    )


@router.post("/{application_id}/cover-letter", response_model=CoverLetterResponse)
def cover_letter_endpoint(
    application_id: str,
    body: CoverLetterRequest,
    user: CurrentUser = Depends(get_current_user),
) -> CoverLetterResponse:
    with user_scoped_client(user.access_token) as client:
        app_row, source, _ = _load_application_and_resume(
            client, application_id, body.resume_profile_id, extra_app_fields=",company,job_title"
        )
        jd_analysis = JDAnalysis(**app_row["jd_analysis_json"])

        letter_text = generate_cover_letter(
            source, jd_analysis, company=app_row["company"], job_title=app_row["job_title"], user_id=user.id
        )
        pdf_bytes = render_cover_letter_pdf(letter_text, source.contact)

        storage_path = f"{user.id}/{application_id}-cover-letter.pdf"
        upload_object(user.access_token, "resumes", storage_path, pdf_bytes, "application/pdf")
        download_url = create_signed_url(user.access_token, "resumes", storage_path)

        update_resp = client.patch(
            "/applications",
            params={"id": f"eq.{application_id}"},
            headers={"Prefer": "return=representation"},
            json={"cover_letter_text": letter_text, "cover_letter_url": storage_path},
        )
        if update_resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Failed to update application: {update_resp.text}")

    return CoverLetterResponse(
        application_id=application_id, cover_letter_text=letter_text, download_url=download_url
    )
