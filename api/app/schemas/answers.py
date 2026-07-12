from pydantic import BaseModel


class CommonAnswerIn(BaseModel):
    answer_value: str


class CommonAnswerOut(BaseModel):
    common_question_id: str
    answer_value: str
    is_encrypted: bool
