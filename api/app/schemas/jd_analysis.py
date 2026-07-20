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
    # Pay/salary range exactly as written in the JD (e.g. "$120,000 -
    # $140,000/yr"), or null if the JD doesn't state one. Surfaced on the
    # extension's job card. Optional with a default so applications analyzed
    # before this field existed still deserialize.
    salary_range: str | None = None
    travel_requirements: str | None = None
    clearance_requirements: str | None = None
