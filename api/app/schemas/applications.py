from pydantic import BaseModel

from app.schemas.jd_analysis import JDAnalysis


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
