"use client";

import type { TemplateField } from "@dm-hq/api-client";

type TemplateFieldsProps = {
  fields: TemplateField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
};

export default function TemplateFields({ fields, values, onChange }: TemplateFieldsProps) {
  return <>
    {fields.map((field) => {
      const value = values[field.key];
      const label = `${field.label}${field.required ? " *" : ""}`;
      if (field.type === "boolean") {
        return <label className="checkbox-label" key={field.key}><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(field.key, event.target.checked)} /> {label}</label>;
      }
      if (field.type === "long_text") {
        return <label key={field.key}>{label}<textarea value={typeof value === "string" ? value : ""} onChange={(event) => onChange(field.key, event.target.value)} rows={3} /></label>;
      }
      if (field.type === "choice") {
        return <label key={field.key}>{label}<select value={typeof value === "string" ? value : ""} onChange={(event) => onChange(field.key, event.target.value)}><option value="">Select…</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
      }
      const inputType = field.type === "number" ? "number" : field.type === "calendar_date" ? "date" : "text";
      return <label key={field.key}>{label}<input type={inputType} value={value === undefined || value === null ? "" : String(value)} onChange={(event) => onChange(field.key, field.type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value)} /></label>;
    })}
  </>;
}
