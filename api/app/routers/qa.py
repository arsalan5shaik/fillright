from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import CurrentUser, get_current_user
from app.core.config import get_settings
from app.db.postgrest import user_scoped_client
from app.schemas.qa import (
    ChoiceAnswer,
    ResolveChoiceRequest,
    ResolveChoiceResponse,
    ResolveQuestionRequest,
    ResolveQuestionResponse,
    UpdateAnswerRequest,
)
from app.services.llm.client import call_embedding, call_structured, call_text
from app.services.qa_resolver import (
    build_choice_prompt,
    build_qa_prompt,
    embedding_to_pgvector_literal,
    snap_to_option,
)

router = APIRouter(prefix="/qa", tags=["qa"])

# Empirically calibrated against text-embedding-3-small: a genuine paraphrase
# of a work-authorization question scored ~0.80 cosine similarity, while
# clearly unrelated application questions (salary, relocation, felony, etc.)
# scored 0.23-0.33 - a wide gap, so 0.7 leaves margin on both sides.
_SIMILARITY_THRESHOLD = 0.7


@router.post("/resolve", response_model=ResolveQuestionResponse)
def resolve_question(
    body: ResolveQuestionRequest, user: CurrentUser = Depends(get_current_user)
) -> ResolveQuestionResponse:
    embedding = call_embedding(body.question_text, user_id=user.id)
    embedding_literal = embedding_to_pgvector_literal(embedding)

    with user_scoped_client(user.access_token) as client:
        match_resp = client.post(
            "/rpc/match_answer_bank",
            json={"query_embedding": embedding_literal, "match_count": 1},
        )
        match_resp.raise_for_status()
        matches = match_resp.json()

        if matches and matches[0]["similarity"] >= _SIMILARITY_THRESHOLD:
            match = matches[0]
            update_resp = client.patch(
                "/answer_bank",
                params={"id": f"eq.{match['id']}"},
                json={
                    "times_reused": match["times_reused"] + 1,
                    "last_used_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            if update_resp.status_code >= 400:
                raise HTTPException(
                    status_code=502, detail=f"Failed to update answer_bank: {update_resp.text}"
                )
            return ResolveQuestionResponse(
                answer_id=match["id"],
                answer_text=match["answer_text"],
                source="answer_bank",
                similarity=match["similarity"],
            )

        answer_text = call_text("qa_resolver", build_qa_prompt(body.question_text), user_id=user.id)

        insert_resp = client.post(
            "/answer_bank",
            headers={"Prefer": "return=representation"},
            json={
                "user_id": user.id,
                "question_text": body.question_text,
                "question_embedding": embedding_literal,
                "answer_text": answer_text,
                "source": "llm_generated",
                "model_used": get_settings().qa_resolver_model,
            },
        )
        if insert_resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Failed to save answer: {insert_resp.text}")
        row = insert_resp.json()[0]

    return ResolveQuestionResponse(answer_id=row["id"], answer_text=answer_text, source="llm_generated", similarity=None)


@router.post("/resolve-choice", response_model=ResolveChoiceResponse)
def resolve_choice(
    body: ResolveChoiceRequest, user: CurrentUser = Depends(get_current_user)
) -> ResolveChoiceResponse:
    """Picks one of a required dropdown/radio's actual options via the AI, for
    a required field FillRight has no mapped answer to. The extension is
    responsible for NOT calling this on sensitive/EEO/legal questions (those
    get a safe non-AI default instead)."""
    if not body.options:
        return ResolveChoiceResponse(answer=None)
    result = call_structured(
        "qa_resolver", build_choice_prompt(body.question_text, body.options), ChoiceAnswer, user_id=user.id
    )
    return ResolveChoiceResponse(answer=snap_to_option(result.answer, body.options))


@router.patch("/answers/{answer_id}", response_model=ResolveQuestionResponse)
def update_answer(
    answer_id: str, body: UpdateAnswerRequest, user: CurrentUser = Depends(get_current_user)
) -> ResolveQuestionResponse:
    """Keeps a saved answer_bank entry in sync when the user edits the field
    after it was auto-filled - without this, the bank would retain the
    original LLM text even though a different answer is what actually got
    submitted."""
    with user_scoped_client(user.access_token) as client:
        resp = client.patch(
            "/answer_bank",
            params={"id": f"eq.{answer_id}"},
            headers={"Prefer": "return=representation"},
            json={"answer_text": body.answer_text},
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Failed to update answer: {resp.text}")
        rows = resp.json()
        if not rows:
            raise HTTPException(status_code=404, detail="Answer not found")
        row = rows[0]

    return ResolveQuestionResponse(
        answer_id=row["id"], answer_text=row["answer_text"], source=row["source"], similarity=None
    )


@router.delete("/answers/{answer_id}", status_code=204)
def delete_answer(answer_id: str, user: CurrentUser = Depends(get_current_user)) -> None:
    """Backs out of the 'save for future applications' default - used when
    the user unchecks the save toggle on a just-generated answer."""
    with user_scoped_client(user.access_token) as client:
        resp = client.delete("/answer_bank", params={"id": f"eq.{answer_id}"})
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Failed to delete answer: {resp.text}")
