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

export interface CommonQuestion {
  id: string;
  question_text: string;
  category: string;
  is_sensitive: boolean;
  input_type: "boolean" | "select" | "text" | "number";
  answer_options: string[] | null;
}

export interface CommonAnswer {
  common_question_id: string;
  answer_value: string;
  is_encrypted: boolean;
}
