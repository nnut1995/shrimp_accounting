"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px] ${className}`}
    />
  );
}

function Label({ pending, pendingText, children }: { pending: boolean; pendingText: ReactNode; children: ReactNode }) {
  return pending ? (
    <span className="inline-flex items-center gap-1.5">
      <Spinner />
      {pendingText}
    </span>
  ) : (
    <>{children}</>
  );
}

/**
 * Submit button for forms that call a server action. While the action runs it
 * is disabled and shows a spinner with `pendingText`, so a slow save is
 * visible and can't be submitted twice.
 */
export default function SubmitButton({
  children,
  pendingText = "กำลังบันทึก...",
  className = "",
}: {
  children: ReactNode;
  pendingText?: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} disabled:opacity-60 disabled:cursor-wait`}
    >
      <Label pending={pending} pendingText={pendingText}>{children}</Label>
    </button>
  );
}

/**
 * Submit button for plain GET filter forms (full page load). Shows a spinner
 * from the moment the form is submitted until the new page replaces this one.
 */
export function FilterButton({
  children,
  pendingText = "กำลังโหลด...",
  className = "",
}: {
  children: ReactNode;
  pendingText?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onSubmit = () => setPending(true);
    // Returning with the back button can restore this page from the browser
    // cache with the spinner still showing; reset it.
    const onShow = () => setPending(false);
    form.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", onShow);
    return () => {
      form.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);
  return (
    <button
      ref={ref}
      type="submit"
      aria-busy={pending}
      className={`${className} ${pending ? "opacity-60 cursor-wait" : ""}`}
    >
      <Label pending={pending} pendingText={pendingText}>{children}</Label>
    </button>
  );
}
