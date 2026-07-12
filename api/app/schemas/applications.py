from pydantic import BaseModel

from app.schemas.jd_analysis import JDAnalysis
from app.schemas.tailored_resume import TailoredResume


class AnalyzeJDRequest(BaseModel):
    company: str
    requisition_id: str | None = None
    job_title: str | None = None
    job_url: str | None = None
    jd_text: str
    resume_profile_id: str | None = None


class ApplicationOut(BaseModel):
    id: str
    company: str
    requisition_id: str | None
    job_title: str | None
    job_url: str | None
    jd_analysis: JDAnalysis
    is_duplicate: bool


class TailorResumeRequest(BaseModel):
    resume_profile_id: str | None = None


class TailorResumeResponse(BaseModel):
    application_id: str
    tailored_resume: TailoredResume
    download_url: str
