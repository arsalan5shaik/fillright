"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePasswordLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function handleMagicLink() {
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    setMessage(error ? error.message : "Check your email for a magic link.");
  }

  return (
    <main className="card auth-card">
      <div className="auth-brand">
        <span className="brand-logo">F</span>
        <span className="auth-brand-name">FillRight</span>
      </div>
      <h1>Log in</h1>
      <p className="card-muted">Welcome back — sign in to manage your résumé and answers.</p>
      <form onSubmit={handlePasswordLogin} style={{ marginTop: 16 }}>
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
            required
          />
        </label>
        <button type="submit" className="btn-primary" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
      <button
        onClick={handleMagicLink}
        style={{ width: "100%", marginTop: 10 }}
        disabled={loading || !email}
      >
        Send magic link instead
      </button>
      {message && (
        <p className="card-muted" style={{ marginTop: 12 }}>
          {message}
        </p>
      )}
      <p className="card-muted" style={{ marginTop: 16, marginBottom: 0 }}>
        No account? <a href="/signup">Sign up</a>
      </p>
    </main>
  );
}
