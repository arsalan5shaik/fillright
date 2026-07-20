import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CommonAnswer, CommonQuestion } from "@/lib/types";
import CommonQuestionsForm from "./CommonQuestionsForm";

export default async function CommonQuestionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data: questions } = await supabase
    .from("common_questions")
    .select("id, question_text, category, is_sensitive, input_type, answer_options")
    .order("category")
    .returns<CommonQuestion[]>();

  const answersRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/answers/common`, {
    headers: { Authorization: `Bearer ${session?.access_token}` },
    cache: "no-store",
  });
  const answers: CommonAnswer[] = answersRes.ok ? await answersRes.json() : [];

  return (
    <main>
      <h1>Common questions</h1>
      <p className="muted">
        Answer these once and every application autofill reuses them. Voluntary questions default to &quot;decline to
        answer&quot; — change them only if you want to disclose.
      </p>
      <div style={{ marginTop: 20 }}>
        <CommonQuestionsForm questions={questions ?? []} initialAnswers={answers} />
      </div>
    </main>
  );
}
