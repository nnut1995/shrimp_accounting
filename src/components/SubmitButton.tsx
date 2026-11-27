"use client";

import {
  createContext,
  useContext,
  useTransition,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
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

const FilterPending = createContext(false);

/**
 * GET filter form that switches pages inside the app instead of reloading the
 * whole site: the current page stays on screen and only the new data is
 * fetched. Works like a normal `<form method="get">` if scripts are off.
 */
export function FilterForm({
  children,
  ...props
}: Omit<ComponentProps<"form">, "method" | "onSubmit" | "action">) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(e.currentTarget)) {
      if (typeof value === "string") params.append(key, value);
    }
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }
  return (
    <form {...props} method="get" onSubmit={onSubmit}>
      <FilterPending.Provider value={pending}>{children}</FilterPending.Provider>
    </form>
  );
}

/** Submit button for `FilterForm`; shows a spinner until the new data is in. */
export function FilterButton({
  children,
  pendingText = "กำลังโหลด...",
  className = "",
}: {
  children: ReactNode;
  pendingText?: ReactNode;
  className?: string;
}) {
  const pending = useContext(FilterPending);
  return (
    <button
      type="submit"
      aria-busy={pending}
      className={`${className} ${pending ? "opacity-60 cursor-wait" : ""}`}
    >
      <Label pending={pending} pendingText={pendingText}>{children}</Label>
    </button>
  );
}
