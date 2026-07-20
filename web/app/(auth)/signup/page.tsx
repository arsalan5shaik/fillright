"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    setMessage(error ? error.message : "Check your email to confirm your account.");
  }

  return (
    <main className="card auth-card">
      <div className="auth-brand">
        <span className="brand-logo">F</span>
        <span className="auth-brand-name">FillRight</span>
      </div>
      <h1>Create your account</h1>
      <p className="card-muted">Set up your profile once — FillRight autofills every Workday application.</p>
      <form onSubmit={handleSignup} style={{ marginTop: 16 }}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <button type="submit" className="btn-primary" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Creating account…" : "Sign up"}
        </button>
      </form>
      {message && (
        <p className="card-muted" style={{ marginTop: 12 }}>
          {message}
        </p>
      )}
      <p className="card-muted" style={{ marginTop: 16, marginBottom: 0 }}>
        Already have an account? <a href="/login">Log in</a>
      </p>
    </main>
  );
}
