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
      <div className="card">
        <h2>Contact</h2>
        <div className="form-grid">
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
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>Work experience</h2>
          <button type="button" className="btn-sm" onClick={addExperience}>
            + Add experience
          </button>
        </div>
        {data.work_experience.length === 0 && (
          <p className="empty">No work experience yet — add your roles so FillRight can autofill them.</p>
        )}
        {data.work_experience.map((exp, i) => (
          <div key={i} className="entry">
            <div className="form-grid">
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
              <label className="full">
                Bullets (one per line)
                <textarea
                  rows={4}
                  value={exp.bullets.join("\n")}
                  onChange={(e) => updateExperience(i, "bullets", e.target.value.split("\n"))}
                />
              </label>
            </div>
            <button type="button" className="btn-sm btn-danger" onClick={() => removeExperience(i)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="section-head">
          <h2>Education</h2>
          <button type="button" className="btn-sm" onClick={addEducation}>
            + Add education
          </button>
        </div>
        {data.education.length === 0 && (
          <p className="empty">No education yet — add your schools, degrees, and GPA.</p>
        )}
        {data.education.map((edu, i) => (
          <div key={i} className="entry">
            <div className="form-grid">
              <label className="full">
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
              <label>
                From
                <input
                  value={edu.start_date ?? ""}
                  placeholder="e.g. 2022"
                  onChange={(e) => updateEducation(i, "start_date", e.target.value)}
                />
              </label>
              <label>
                To
                <input
                  value={edu.end_date ?? ""}
                  placeholder="e.g. 2026"
                  onChange={(e) => updateEducation(i, "end_date", e.target.value)}
                />
              </label>
            </div>
            <button type="button" className="btn-sm btn-danger" onClick={() => removeEducation(i)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Skills</h2>
        <p className="card-muted">Comma-separated. Used to fill &quot;Skills&quot; fields on applications.</p>
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

        <h2 style={{ marginTop: 16 }}>Certifications</h2>
        <p className="card-muted">Comma-separated.</p>
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
      </div>

      <div className="row">
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save résumé"}
        </button>
        {message && <span className="card-muted">{message}</span>}
      </div>
    </div>
  );
}
