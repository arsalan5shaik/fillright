import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>FillRight</h1>
      <p>Signed in as {user.email}</p>
      <p>
        <Link href="/resume">Your resumes</Link>
      </p>
      <p>
        <Link href="/common-questions">Common questions</Link>
      </p>
      <p>
        <Link href="/profile">Profile</Link>
      </p>
      <SignOutButton />
    </main>
  );
}
