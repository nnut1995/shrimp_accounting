"use client";

import { useState, type ReactNode } from "react";

export type EditField = {
  display: ReactNode;
  name?: string;
  value?: string;
  type?: string;
  inputMode?: "decimal";
  options?: { value: string; label: string }[];
  right?: boolean;
};

const td = "border border-gray-300 px-2 py-1.5 text-sm";
const input = "border rounded px-1.5 py-1 text-sm w-full min-w-16 bg-white";

export default function EditableRow({
  formId,
  action,
  hidden,
  fields,
  deleteSlot,
}: {
  formId: string;
  action: (formData: FormData) => Promise<void>;
  hidden: Record<string, string>;
  fields: EditField[];
  deleteSlot: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <tr className={editing ? "bg-blue-50" : undefined}>
      {fields.map((f, i) => (
        <td key={i} className={`${td} ${f.right ? "text-right" : ""}`}>
          {editing && f.name ? (
            f.options ? (
              <select name={f.name} defaultValue={f.value} form={formId} className={input}>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={f.name}
                defaultValue={f.value}
                type={f.type ?? "text"}
                inputMode={f.inputMode}
                form={formId}
                className={input}
              />
            )
          ) : (
            f.display
          )}
        </td>
      ))}
      <td className={`${td} no-print text-center whitespace-nowrap`}>
        {editing ? (
          <form
            id={formId}
            action={async (formData) => {
              setSaving(true);
              try {
                await action(formData);
                setEditing(false);
              } finally {
                setSaving(false);
              }
            }}
            className="inline-flex items-center gap-2"
          >
            {Object.entries(hidden).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <button
              type="submit"
              disabled={saving}
              className="text-blue-600 hover:underline text-sm disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="text-gray-500 hover:underline text-sm"
            >
              ยกเลิก
            </button>
          </form>
        ) : (
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-blue-600 hover:underline text-sm"
            >
              แก้ไข
            </button>
            {deleteSlot}
          </span>
        )}
      </td>
    </tr>
  );
}
