import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WaitlistActionForm, waitlistActionFields } from "./waitlist-action-form";

describe("waitlist action form", () => {
  test("builds the native form payload for an action and delete confirmation", () => {
    expect(waitlistActionFields("tester@example.test", { mode: "resend" }, false)).toEqual([
      ["email", "tester@example.test"],
      ["mode", "resend"],
    ]);
    expect(waitlistActionFields("gone@example.test", {}, true)).toEqual([
      ["email", "gone@example.test"],
      ["confirm", "delete"],
    ]);
  });

  test("renders a native action form with an isolated pending button", () => {
    const markup = renderToStaticMarkup(React.createElement(WaitlistActionForm, {
      action: async () => undefined,
      email: "tester@example.test",
      label: "Einladen",
      pendingLabel: "Sende...",
      ariaLabel: "Tester einladen",
      variant: "primary",
      hiddenFields: { intent: "invite", status: "confirmed", limit: "10" },
    }));

    expect(markup).toContain("<form");
    expect(markup).toContain('name="email" value="tester@example.test"');
    expect(markup).toContain('aria-busy="false"');
    expect(markup).toContain("serverseitig");
    expect(markup).not.toContain("window.location");
  });
});
