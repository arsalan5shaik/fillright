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

export type ScanProgressMessage = { type: "SCAN_PROGRESS"; tabId: number; status: string };

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

export interface AutofillData {
  profileFields: Record<string, string>;
  contact: ResumeContact | null;
  commonAnswers: Record<string, string>;
  jdLocation: JdLocation | null;
}

export type GetAutofillDataMessage = { type: "GET_AUTOFILL_DATA" };
