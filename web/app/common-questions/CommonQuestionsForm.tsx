"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CommonAnswer, CommonQuestion } from "@/lib/types";

function defaultAnswerFor(q: CommonQuestion): string {
  if (q.is_sensitive && q.answer_options) {
    const decline = q.answer_options.find((o) => /decline/i.test(o));
    if (decline) return decline;
  }
  return "";
}

function renderInput(q: CommonQuestion, value: string, onChange: (v: string) => void) {
  if (q.input_type === "boolean") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">-- select --</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    );
  }
  if (q.input_type === "select" && q.answer_options) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">-- select --</option>
        {q.answer_options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  return <input value={value} onChange={(e) => onChange(e.target.value)} />;
}

export default function CommonQuestionsForm({
  questions,
  initialAnswers,
}: {
  questions: CommonQuestion[];
  initialAnswers: CommonAnswer[];
}) {
  const supabase = createClient();

  const initial: Record<string, string> = {};
  for (const q of questions) {
    const existing = initialAnswers.find((a) => a.common_question_id === q.id);
    initial[q.id] = existing?.answer_value ?? defaultAnswerFor(q);
  }

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function update(id: string, value: string) {
    setValues((v) => ({ ...v, [id]: value }));
  }

  async function handleSaveAll() {
    setSaving(true);
    setMessage(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    const results = await Promise.all(
      questions
        .filter((q) => values[q.id] !== "")
        .map((q) =>
          fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/answers/common/${q.id}`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ answer_value: values[q.id] }),
          }),
        ),
    );

    setSaving(false);
    setMessage(results.every((r) => r.ok) ? "Saved." : "Some answers failed to save.");
  }

  const grouped = questions.reduce<Record<string, CommonQuestion[]>>((acc, q) => {
    (acc[q.category] ??= []).push(q);
    return acc;
  }, {});

  return (
    <div>
      {Object.entries(grouped).map(([category, qs]) => (
        <fieldset key={category} style={{ marginBottom: 16 }}>
          <legend>{category.replace(/_/g, " ")}</legend>
          {qs.map((q) => (
            <div key={q.id} style={{ marginBottom: 12 }}>
              <label>
                {q.question_text}
                {q.is_sensitive && " (voluntary)"}
                {renderInput(q, values[q.id] ?? "", (v) => update(q.id, v))}
              </label>
            </div>
          ))}
        </fieldset>
      ))}
      <button onClick={handleSaveAll} disabled={saving}>
        {saving ? "Saving..." : "Save all"}
      </button>
      {message && <p>{message}</p>}
    </div>
  );
}
