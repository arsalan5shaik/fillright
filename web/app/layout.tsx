import type { Metadata } from "next";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "FillRight",
  description: "AI-assisted job application autofill",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body>
        {user && <AppHeader />}
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
