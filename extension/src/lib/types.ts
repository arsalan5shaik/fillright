export interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at: number | null;
  user: {
    id: string;
    email: string | null;
  };
}
