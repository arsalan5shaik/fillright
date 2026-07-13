import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileFieldsForm from "./ProfileFieldsForm";
import WorkdayCredentialsForm from "./WorkdayCredentialsForm";

const FIELD_KEYS = [
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

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: fields } = await supabase.from("profile_fields").select("field_key, field_value");

  const initial: Record<string, string> = {};
  for (const key of FIELD_KEYS) initial[key] = "";
  for (const f of fields ?? []) initial[f.field_key] = f.field_value ?? "";

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
    <main style={{ padding: 24, maxWidth: 480 }}>
      <p>
        <Link href="/">Back home</Link>
      </p>
      <h1>Profile</h1>
      <p>Contact details used to autofill Workday&apos;s &quot;My Information&quot; step.</p>
      <ProfileFieldsForm initialValues={initial} />

      <h2 style={{ marginTop: 32 }}>Workday account credentials</h2>
      <p>
        Workday requires a separate candidate account per employer. Save one email/password here to reuse across
        every application instead of inventing a new one each time. Stored encrypted; reusing one password across
        many external accounts is a real tradeoff you&apos;re accepting for convenience.
      </p>
      <WorkdayCredentialsForm initialEmail={workdayCredentials.email ?? ""} initialPassword={workdayCredentials.password ?? ""} />
    </main>
  );
}
