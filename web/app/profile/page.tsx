import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileFieldsForm from "./ProfileFieldsForm";
import JobPreferencesForm from "./JobPreferencesForm";
import WorkdayCredentialsForm from "./WorkdayCredentialsForm";

const CONTACT_KEYS = [
  "first_name",
  "last_name",
  "phone",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "zip_code",
  "country",
  "linkedin_url",
  "portfolio_url",
  "github_url",
] as const;

const PREFERENCE_KEYS = [
  "years_experience",
  "desired_salary",
  "available_start_date",
  "preferred_location",
  "willing_to_relocate",
] as const;

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: fields } = await supabase.from("profile_fields").select("field_key, field_value");
  const stored: Record<string, string> = {};
  for (const f of fields ?? []) stored[f.field_key] = f.field_value ?? "";

  const contact: Record<string, string> = {};
  for (const key of CONTACT_KEYS) contact[key] = stored[key] ?? "";
  const preferences: Record<string, string> = {};
  for (const key of PREFERENCE_KEYS) preferences[key] = stored[key] ?? "";

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const credsRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/profile/workday-credentials`, {
    headers: { Authorization: `Bearer ${session?.access_token}` },
    cache: "no-store",
  });
  const workdayCredentials: { email: string | null; password: string | null } = credsRes.ok
    ? await credsRes.json()
    : { email: null, password: null };

  return (
    <main>
      <h1>Profile</h1>
      <p className="muted">Everything FillRight uses to autofill applications, in one place.</p>

      <div className="card" style={{ marginTop: 24 }}>
        <h2>Résumé, experience &amp; skills</h2>
        <p className="card-muted">
          Your work history, education, and skills come from your résumé — upload and edit them on the Résumés page.
        </p>
        <Link href="/resume" className="btn">
          Manage résumés
        </Link>
      </div>

      <div className="card">
        <h2>Work authorization, salary &amp; voluntary disclosures</h2>
        <p className="card-muted">
          Answer once — work authorization, sponsorship, salary range, relocation, remote preference, and EEO
          self-identification — and FillRight reuses them across applications.
        </p>
        <Link href="/common-questions" className="btn">
          Manage questions &amp; disclosures
        </Link>
      </div>

      <div className="card">
        <h2>Contact details</h2>
        <p className="card-muted">Used to autofill Workday&apos;s &quot;My Information&quot; step.</p>
        <ProfileFieldsForm initialValues={contact} />
      </div>

      <div className="card">
        <h2>Job preferences</h2>
        <p className="card-muted">
          Common application fields not on your résumé. FillRight autofills these when a form asks for them.
        </p>
        <JobPreferencesForm initialValues={preferences} />
      </div>

      <div className="card">
        <h2>Workday account credentials</h2>
        <p className="card-muted">
          Workday requires a separate candidate account per employer. Save one email/password here to reuse across
          every application instead of inventing a new one each time. Stored encrypted; reusing one password across
          many external accounts is a real tradeoff you&apos;re accepting for convenience.
        </p>
        <WorkdayCredentialsForm
          initialEmail={workdayCredentials.email ?? ""}
          initialPassword={workdayCredentials.password ?? ""}
        />
      </div>
    </main>
  );
}
