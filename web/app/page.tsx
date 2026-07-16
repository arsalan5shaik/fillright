import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const TILES = [
  { href: "/resume", title: "Résumés", desc: "Upload a résumé and review the parsed work history, education, and skills FillRight autofills from." },
  { href: "/profile", title: "Profile", desc: "Contact details and your reusable Workday account credentials." },
  { href: "/common-questions", title: "Common questions", desc: "Answer work-authorization, sponsorship, and EEO questions once — reused across applications." },
  { href: "/applications", title: "Applications", desc: "Every posting you've scanned, with tailored résumé and cover letter." },
];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main>
      <h1>Welcome back</h1>
      <p className="muted">Signed in as {user.email}</p>

      <div className="grid" style={{ marginTop: 24 }}>
        {TILES.map((t) => (
          <Link key={t.href} href={t.href} className="tile">
            <div className="tile-title">{t.title}</div>
            <div className="tile-desc">{t.desc}</div>
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h3>How it works</h3>
        <p className="card-muted" style={{ margin: 0 }}>
          Keep your résumé and answers up to date here. Then, on any Workday job posting, the FillRight extension scans
          the role, tailors your résumé, and autofills the application — you review and submit.
        </p>
      </div>
    </main>
  );
}
