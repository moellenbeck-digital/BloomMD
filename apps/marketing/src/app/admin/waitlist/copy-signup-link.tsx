"use client";

import { useState } from "react";

export function CopySignupLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copyLink}
      className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-[#1A1A1A] hover:border-[#FF6B35] focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
      aria-label="Signup-Link kopieren"
    >
      {copied ? "Link kopiert" : "Signup-Link kopieren"}
    </button>
  );
}
