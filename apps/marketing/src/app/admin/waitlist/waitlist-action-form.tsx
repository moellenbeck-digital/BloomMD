"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type ActionVariant = "primary" | "warning" | "danger";
type WaitlistServerAction = (formData: FormData) => void | Promise<void>;

interface WaitlistActionFormProps {
  action: WaitlistServerAction;
  email: string;
  label: string;
  pendingLabel: string;
  ariaLabel: string;
  variant: ActionVariant;
  hiddenFields?: Record<string, string>;
  confirmBeforeSubmit?: boolean;
  locale?: "de" | "en";
}

const buttonClasses: Record<ActionVariant, string> = {
  primary: "border-[#C94317] bg-[#C94317] text-white hover:bg-[#A93612] focus:ring-[#FF6B35]/30 disabled:border-[#D8B7A6] disabled:bg-[#D8B7A6]",
  warning: "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500 focus:ring-amber-300/40 disabled:border-amber-200 disabled:text-amber-500",
  danger: "border-red-300 bg-white text-red-700 hover:border-red-500 hover:bg-red-50 focus:ring-red-300/40 disabled:border-red-200 disabled:text-red-400",
};

function SubmitButton({
  label,
  pendingLabel,
  ariaLabel,
  variant,
  confirming,
  statusId,
  locale,
}: {
  label: string;
  pendingLabel: string;
  ariaLabel: string;
  variant: ActionVariant;
  confirming: boolean;
  statusId: string;
  locale: "de" | "en";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex h-10 min-w-32 items-center justify-center rounded-md border px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 disabled:cursor-wait ${buttonClasses[variant]}`}
      aria-label={ariaLabel}
      aria-busy={pending}
      aria-describedby={statusId}
    >
      {pending ? pendingLabel : confirming ? (locale === "en" ? "Confirm deletion" : "Löschen bestätigen") : label}
    </button>
  );
}

export function waitlistActionFields(email: string, hiddenFields: Record<string, string>, includeDeleteConfirmation: boolean) {
  const fields: Array<[string, string]> = [["email", email], ...Object.entries(hiddenFields)];
  if (includeDeleteConfirmation) fields.push(["confirm", "delete"]);
  return fields;
}

export function WaitlistActionForm({
  action,
  email,
  label,
  pendingLabel,
  ariaLabel,
  variant,
  hiddenFields = {},
  confirmBeforeSubmit = false,
  locale = "de",
}: WaitlistActionFormProps) {
  const [confirming, setConfirming] = useState(false);
  const statusId = `waitlist-action-${email.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (confirmBeforeSubmit && !confirming) {
          event.preventDefault();
          setConfirming(true);
        }
      }}
      className="flex flex-col items-start gap-2 lg:items-end"
    >
      {waitlistActionFields(email, hiddenFields, confirmBeforeSubmit && confirming).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {confirmBeforeSubmit && (
        <noscript>
          <label className="flex items-center gap-2 text-xs text-red-700">
            <input type="checkbox" name="confirm" value="delete" required />
            {locale === "en" ? "Confirm deletion" : "Löschung bestätigen"}
          </label>
        </noscript>
      )}
      <SubmitButton
        label={label}
        pendingLabel={pendingLabel}
        ariaLabel={ariaLabel}
        variant={variant}
        confirming={confirming}
        statusId={statusId}
        locale={locale}
      />
      <p id={statusId} aria-live="polite" className="max-w-48 text-xs leading-5 text-neutral-600">
        {confirming && (locale === "en" ? "Confirm once more to remove this entry permanently." : "Zum endgültigen Entfernen noch einmal bestätigen.")}
        {!confirming && (locale === "en" ? "The action runs on the server and refreshes the list afterwards." : "Die Aktion wird serverseitig ausgeführt und die Liste danach aktualisiert.")}
      </p>
    </form>
  );
}
