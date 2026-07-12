from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.core.auth import CurrentUser, get_current_user
from app.db.postgrest import user_scoped_client
from app.services.resume_parser import parse_resume

router = APIRouter(prefix="/resumes", tags=["resumes"])

_CONTENT_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}


@router.post("/upload")
async def upload_resume(
    file: UploadFile = File(...),
    profile_name: str = Form("Default Resume"),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    file_type = _CONTENT_TYPES.get(file.content_type or "")
    if file_type is None:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    content = await file.read()
    parsed = parse_resume(content, file_type, user_id=user.id)

    with user_scoped_client(user.access_token) as client:
        response = client.post(
            "/resume_profiles",
            headers={"Prefer": "return=representation"},
            json={
                "user_id": user.id,
                "profile_name": profile_name,
                "raw_file_type": file_type,
                "parsed_json": parsed.model_dump(),
            },
        )
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Failed to save resume: {response.text}")
        row = response.json()[0]

    return {"id": row["id"], "profile_name": row["profile_name"], "parsed": parsed}
