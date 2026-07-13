from pydantic import BaseModel


class WorkdayCredentialsIn(BaseModel):
    email: str
    password: str


class WorkdayCredentialsOut(BaseModel):
    email: str | None
    password: str | None
