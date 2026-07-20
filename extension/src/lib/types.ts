export interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at: number | null;
  user: {
    id: string;
    email: string | null;
  };
}

export interface ScannedJobPosting {
  company: string;
  requisitionId: string | null;
  jobTitle: string;
  jobUrl: string;
  jdText: string;
}

export interface AnalyzeApplicationResult {
  id: string;
  company: string;
  requisition_id: string | null;
  job_title: string | null;
  job_url: string | null;
  is_duplicate: boolean;
}

export type ScanProgressMessage = { type: "SCAN_PROGRESS"; tabId: number; status: string; percent: number };

export type ScanJobPostingMessage = { type: "SCAN_JOB_POSTING"; posting: ScannedJobPosting };

export interface ResumeContact {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  github_url: string | null;
}

export interface JdLocation {
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface WorkExperienceEntry {
  company: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  bullets: string[];
}

export interface EducationEntry {
  institution: string;
  degree: string | null;
  field_of_study: string | null;
  gpa: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface AutofillData {
  profileFields: Record<string, string>;
  contact: ResumeContact | null;
  commonAnswers: Record<string, string>;
  jdLocation: JdLocation | null;
  jdKeywords: string[];
  // The user's own résumé skills (short tokens like "Python", "AWS"), used to
  // fill a "Skills" chip field - distinct from jdKeywords, which are the job
  // description's requirements and are wrong to type into a field meant for
  // the candidate's actual skills.
  resumeSkills: string[];
  // Prefers the tailored resume's work_experience/education (rewritten
  // bullets to match this specific job) over the base resume's, so
  // Workday's own experience fields show the same content as the tailored
  // PDF - falls back to the base resume when no tailored version exists
  // yet for the current application.
  workExperience: WorkExperienceEntry[];
  education: EducationEntry[];
}

export type GetAutofillDataMessage = { type: "GET_AUTOFILL_DATA" };

export interface ResolvedAnswer {
  answerId: string;
  answerText: string;
  source: "answer_bank" | "llm_generated";
  similarity: number | null;
}

export type ResolveQuestionMessage = { type: "RESOLVE_QUESTION"; questionText: string };
export type ResolveChoiceMessage = { type: "RESOLVE_CHOICE"; questionText: string; options: string[] };
export interface ResolvedChoice {
  answer: string | null;
}
export type UpdateAnswerMessage = { type: "UPDATE_ANSWER"; answerId: string; answerText: string };
export type DeleteAnswerMessage = { type: "DELETE_ANSWER"; answerId: string };

export interface TailoredResumeFilePayload {
  blob: Blob;
  filename: string;
}

export type GetTailoredResumeFileMessage = { type: "GET_TAILORED_RESUME_FILE" };
export type GetCoverLetterFileMessage = { type: "GET_COVER_LETTER_FILE" };
