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
