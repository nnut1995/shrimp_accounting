"use client";

import type { ReactNode } from "react";

export default function DeleteButton({
  action,
  confirmText = "ยืนยันการลบ?",
  className = "text-red-600 hover:underline text-sm",
  children = "ลบ",
}: {
  action: () => Promise<void>;
  confirmText?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <form
      action={action}
      className="inline no-print"
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
