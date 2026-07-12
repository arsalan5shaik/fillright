from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import CurrentUser, get_current_user
from app.core.security import decrypt_value, encrypt_value
from app.db.postgrest import user_scoped_client
from app.schemas.answers import CommonAnswerIn, CommonAnswerOut

router = APIRouter(prefix="/answers", tags=["answers"])


@router.get("/common", response_model=list[CommonAnswerOut])
def list_common_answers(user: CurrentUser = Depends(get_current_user)) -> list[CommonAnswerOut]:
    with user_scoped_client(user.access_token) as client:
        resp = client.get(
            "/user_common_answers",
            params={"select": "common_question_id,answer_value,is_encrypted"},
        )
        resp.raise_for_status()
        rows = resp.json()

    return [
        CommonAnswerOut(
            common_question_id=row["common_question_id"],
            answer_value=decrypt_value(row["answer_value"]) if row["is_encrypted"] else row["answer_value"],
            is_encrypted=row["is_encrypted"],
        )
        for row in rows
    ]


@router.put("/common/{question_id}", response_model=CommonAnswerOut)
def save_common_answer(
    question_id: str,
    body: CommonAnswerIn,
    user: CurrentUser = Depends(get_current_user),
) -> CommonAnswerOut:
    with user_scoped_client(user.access_token) as client:
        question_resp = client.get(
            "/common_questions",
            params={"select": "is_sensitive", "id": f"eq.{question_id}"},
        )
        question_resp.raise_for_status()
        question_rows = question_resp.json()
        if not question_rows:
            raise HTTPException(status_code=404, detail="Unknown question")
        is_sensitive = question_rows[0]["is_sensitive"]

        stored_value = encrypt_value(body.answer_value) if is_sensitive else body.answer_value

        upsert_resp = client.post(
            "/user_common_answers",
            params={"on_conflict": "user_id,common_question_id"},
            headers={"Prefer": "resolution=merge-duplicates,return=representation"},
            json={
                "user_id": user.id,
                "common_question_id": question_id,
                "answer_value": stored_value,
                "is_encrypted": is_sensitive,
            },
        )
        if upsert_resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Failed to save answer: {upsert_resp.text}")
        row = upsert_resp.json()[0]

    return CommonAnswerOut(
        common_question_id=row["common_question_id"],
        answer_value=body.answer_value,
        is_encrypted=row["is_encrypted"],
    )
