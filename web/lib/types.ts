export interface ContactInfo {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  github_url: string | null;
}

export interface WorkExperience {
  company: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  bullets: string[];
}

export interface Education {
  institution: string;
  degree: string | null;
  field_of_study: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface ParsedResume {
  contact: ContactInfo;
  work_experience: WorkExperience[];
  education: Education[];
  skills: string[];
  certifications: string[];
}

export interface ResumeProfileSummary {
  id: string;
  profile_name: string;
  is_default: boolean;
  updated_at: string;
}
