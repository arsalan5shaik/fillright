from pydantic import BaseModel

from app.schemas.resume import ContactInfo, Education, WorkExperience


class TailoredResume(BaseModel):
    contact: ContactInfo
    summary: str | None = None
    work_experience: list[WorkExperience]
    education: list[Education]
    skills: list[str]
    certifications: list[str] = []
