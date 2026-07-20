from typing import Literal

from pydantic import BaseModel


class ResolveQuestionRequest(BaseModel):
    question_text: str


class ResolveQuestionResponse(BaseModel):
    answer_id: str
    answer_text: str
    source: Literal["answer_bank", "llm_generated"]
    similarity: float | None = None


class UpdateAnswerRequest(BaseModel):
    answer_text: str


class ResolveChoiceRequest(BaseModel):
    question_text: str
    options: list[str]


class ResolveChoiceResponse(BaseModel):
    # Exactly one of the request's options (server-snapped), or null if the AI
    # couldn't pick a sensible one.
    answer: str | None = None


class ChoiceAnswer(BaseModel):
    answer: str
