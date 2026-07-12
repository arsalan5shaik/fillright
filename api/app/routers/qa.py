from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import CurrentUser, get_current_user
from app.core.config import get_settings
from app.db.postgrest import user_scoped_client
from app.schemas.qa import ResolveQuestionRequest, ResolveQuestionResponse
from app.services.llm.client import call_embedding, call_text
from app.services.qa_resolver import build_qa_prompt, embedding_to_pgvector_literal

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
                answer_text=match["answer_text"], source="answer_bank", similarity=match["similarity"]
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

    return ResolveQuestionResponse(answer_text=answer_text, source="llm_generated", similarity=None)
