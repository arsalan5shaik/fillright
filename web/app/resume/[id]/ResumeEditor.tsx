"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ContactInfo, Education, ParsedResume, WorkExperience } from "@/lib/types";

export default function ResumeEditor({
  resumeId,
  initialData,
}: {
  resumeId: string;
  initialData: ParsedResume;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [data, setData] = useState<ParsedResume>(initialData);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function updateContact(field: keyof ContactInfo, value: string) {
    setData((d) => ({ ...d, contact: { ...d.contact, [field]: value } }));
  }

  function updateExperience(index: number, field: keyof WorkExperience, value: string | string[]) {
    setData((d) => {
      const work_experience = [...d.work_experience];
      work_experience[index] = { ...work_experience[index], [field]: value };
      return { ...d, work_experience };
    });
  }

  function removeExperience(index: number) {
    setData((d) => ({ ...d, work_experience: d.work_experience.filter((_, i) => i !== index) }));
  }

  function addExperience() {
    setData((d) => ({
      ...d,
      work_experience: [
        ...d.work_experience,
        { company: "", title: "", start_date: null, end_date: null, location: null, bullets: [] },
      ],
    }));
  }

  function updateEducation(index: number, field: keyof Education, value: string) {
    setData((d) => {
      const education = [...d.education];
      education[index] = { ...education[index], [field]: value };
      return { ...d, education };
    });
  }

  function removeEducation(index: number) {
    setData((d) => ({ ...d, education: d.education.filter((_, i) => i !== index) }));
  }

  function addEducation() {
    setData((d) => ({
      ...d,
      education: [
        ...d.education,
        { institution: "", degree: null, field_of_study: null, gpa: null, start_date: null, end_date: null },
      ],
    }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const { error } = await supabase
      .from("resume_profiles")
      .update({ parsed_json: data })
      .eq("id", resumeId);
    setSaving(false);
    setMessage(error ? error.message : "Saved.");
    router.refresh();
  }

  return (
    <div>
      <h2>Contact</h2>
      <label>
        Full name
        <input
          value={data.contact.full_name ?? ""}
          onChange={(e) => updateContact("full_name", e.target.value)}
        />
      </label>
      <label>
        Email
        <input value={data.contact.email ?? ""} onChange={(e) => updateContact("email", e.target.value)} />
      </label>
      <label>
        Phone
        <input value={data.contact.phone ?? ""} onChange={(e) => updateContact("phone", e.target.value)} />
      </label>
      <label>
        LinkedIn
        <input
          value={data.contact.linkedin_url ?? ""}
          onChange={(e) => updateContact("linkedin_url", e.target.value)}
        />
      </label>

      <h2>Work experience</h2>
      {data.work_experience.map((exp, i) => (
        <fieldset key={i} style={{ marginBottom: 12 }}>
          <label>
            Company
            <input value={exp.company} onChange={(e) => updateExperience(i, "company", e.target.value)} />
          </label>
          <label>
            Title
            <input value={exp.title} onChange={(e) => updateExperience(i, "title", e.target.value)} />
          </label>
          <label>
            Start
            <input
              value={exp.start_date ?? ""}
              onChange={(e) => updateExperience(i, "start_date", e.target.value)}
            />
          </label>
          <label>
            End
            <input
              value={exp.end_date ?? ""}
              onChange={(e) => updateExperience(i, "end_date", e.target.value)}
            />
          </label>
          <label>
            Bullets (one per line)
            <textarea
              rows={4}
              value={exp.bullets.join("\n")}
              onChange={(e) => updateExperience(i, "bullets", e.target.value.split("\n"))}
            />
          </label>
          <button type="button" onClick={() => removeExperience(i)}>
            Remove
          </button>
        </fieldset>
      ))}
      <button type="button" onClick={addExperience}>
        Add experience
      </button>

      <h2>Education</h2>
      {data.education.map((edu, i) => (
        <fieldset key={i} style={{ marginBottom: 12 }}>
          <label>
            Institution
            <input
              value={edu.institution}
              onChange={(e) => updateEducation(i, "institution", e.target.value)}
            />
          </label>
          <label>
            Degree
            <input value={edu.degree ?? ""} onChange={(e) => updateEducation(i, "degree", e.target.value)} />
          </label>
          <label>
            Field of study
            <input
              value={edu.field_of_study ?? ""}
              onChange={(e) => updateEducation(i, "field_of_study", e.target.value)}
            />
          </label>
          <label>
            GPA
            <input
              value={edu.gpa ?? ""}
              placeholder="e.g. 3.8"
              onChange={(e) => updateEducation(i, "gpa", e.target.value)}
            />
          </label>
          <div className="row">
            <label style={{ flex: 1 }}>
              From
              <input
                value={edu.start_date ?? ""}
                placeholder="e.g. 2022"
                onChange={(e) => updateEducation(i, "start_date", e.target.value)}
              />
            </label>
            <label style={{ flex: 1 }}>
              To
              <input
                value={edu.end_date ?? ""}
                placeholder="e.g. 2026"
                onChange={(e) => updateEducation(i, "end_date", e.target.value)}
              />
            </label>
          </div>
          <button type="button" onClick={() => removeEducation(i)}>
            Remove
          </button>
        </fieldset>
      ))}
      <button type="button" onClick={addEducation}>
        Add education
      </button>

      <h2>Skills</h2>
      <input
        value={data.skills.join(", ")}
        onChange={(e) =>
          setData((d) => ({
            ...d,
            skills: e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          }))
        }
      />

      <h2>Certifications</h2>
      <input
        value={data.certifications.join(", ")}
        onChange={(e) =>
          setData((d) => ({
            ...d,
            certifications: e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          }))
        }
      />

      <div style={{ marginTop: 16 }}>
        <button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
        {message && <span style={{ marginLeft: 8 }}>{message}</span>}
      </div>
    </div>
  );
}
