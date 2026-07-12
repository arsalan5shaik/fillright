from typing import Literal

from pydantic import BaseModel


class ResolveQuestionRequest(BaseModel):
    question_text: str


class ResolveQuestionResponse(BaseModel):
    answer_text: str
    source: Literal["answer_bank", "llm_generated"]
    similarity: float | None = None
