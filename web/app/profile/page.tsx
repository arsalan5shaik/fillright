import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileFieldsForm from "./ProfileFieldsForm";

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

  return (
    <main style={{ padding: 24, maxWidth: 480 }}>
      <p>
        <Link href="/">Back home</Link>
      </p>
      <h1>Profile</h1>
      <p>Contact details used to autofill Workday&apos;s &quot;My Information&quot; step.</p>
      <ProfileFieldsForm initialValues={initial} />
    </main>
  );
}
