from typing import Literal

from pydantic import BaseModel


class Keyword(BaseModel):
    term: str
    required: bool


class JobLocation(BaseModel):
    city: str | None = None
    state: str | None = None
    country: str | None = None
    workplace_type: Literal["remote", "hybrid", "onsite"] | None = None


class JDAnalysis(BaseModel):
    keywords: list[Keyword] = []
    seniority: str | None = None
    locations: list[JobLocation] = []
    employment_type: str | None = None
    travel_requirements: str | None = None
    clearance_requirements: str | None = None
