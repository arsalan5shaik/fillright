from pydantic import BaseModel


class ContactInfo(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    linkedin_url: str | None = None
    portfolio_url: str | None = None
    github_url: str | None = None


class WorkExperience(BaseModel):
    company: str
    title: str
    start_date: str | None = None
    end_date: str | None = None
    location: str | None = None
    bullets: list[str] = []


class Education(BaseModel):
    institution: str
    degree: str | None = None
    field_of_study: str | None = None
    gpa: str | None = None
    start_date: str | None = None
    end_date: str | None = None


class ParsedResume(BaseModel):
    contact: ContactInfo
    work_experience: list[WorkExperience] = []
    education: list[Education] = []
    skills: list[str] = []
    certifications: list[str] = []
