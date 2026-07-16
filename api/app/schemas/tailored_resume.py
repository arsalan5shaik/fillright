from pydantic import BaseModel

from app.schemas.resume import ContactInfo, Education, WorkExperience


class TailoredResume(BaseModel):
    contact: ContactInfo
    summary: str | None = None
    work_experience: list[WorkExperience]
    education: list[Education]
    skills: list[str]
    certifications: list[str] = []


class BulletCritique(BaseModel):
    original: str
    plausible: bool
    # Equal to `original` when plausible; a toned-down, still-relevant rewrite
    # when the recruiter judges the bullet an overreach for the actual role.
    revised: str


class EntryCritique(BaseModel):
    company: str
    title: str
    bullets: list[BulletCritique]


class ResumeCritique(BaseModel):
    """Output of the recruiter self-critique pass: a per-bullet plausibility
    judgment on the tailored résumé, used to revise overreaching bullets back
    down to something believable for the candidate's actual prior role."""

    entries: list[EntryCritique]
