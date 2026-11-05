import { describe, expect, test } from "bun:test";
import { canonicalEmail } from "./email-canonical";

describe("canonical email address (#277)", () => {
  test("lowercases and trims", () => {
    expect(canonicalEmail("  Max.Muster@Example.DE ")).toBe("max.muster@example.de");
  });

  test("drops +tag of the local part for every domain", () => {
    expect(canonicalEmail("a+1@x.de")).toBe("a@x.de");
    expect(canonicalEmail("a+1+2@x.de")).toBe("a@x.de");
    expect(canonicalEmail("a+@x.de")).toBe("a@x.de");
    expect(canonicalEmail("a.b+shop@uni.example")).toBe("a.b@uni.example");
  });

  test("keeps the dots of the local part outside Gmail", () => {
    expect(canonicalEmail("a.b@x.de")).not.toBe(canonicalEmail("ab@x.de"));
    expect(canonicalEmail("a.b@outlook.com")).toBe("a.b@outlook.com");
  });

  test("Gmail: dots are dropped and googlemail.com is read as gmail.com", () => {
    expect(canonicalEmail("a.b@gmail.com")).toBe("ab@gmail.com");
    expect(canonicalEmail("A.B+x@Gmail.com")).toBe("ab@gmail.com");
    expect(canonicalEmail("a.b@googlemail.com")).toBe("ab@gmail.com");
    expect(canonicalEmail("ab@googlemail.com")).toBe(canonicalEmail("a.b+tag@gmail.com"));
  });

  test("other domains that merely look like Gmail are left alone", () => {
    expect(canonicalEmail("a.b@gmail.com.evil.test")).toBe("a.b@gmail.com.evil.test");
    expect(canonicalEmail("a.b@notgmail.com")).toBe("a.b@notgmail.com");
    expect(canonicalEmail("a.b@mail.gmail.com")).toBe("a.b@mail.gmail.com");
  });

  test("a local part that would be empty is left as it was", () => {
    expect(canonicalEmail("+tag@x.de")).toBe("+tag@x.de");
    expect(canonicalEmail("+a.b@gmail.com")).toBe("+a.b@gmail.com");
  });

  test("an address without @ is only normalised; the last @ separates the domain", () => {
    expect(canonicalEmail(" NoAt ")).toBe("noat");
    expect(canonicalEmail("a@b+c@x.de")).toBe("a@b@x.de");
  });

  test("is idempotent", () => {
    for (const email of ["A.B+x@GoogleMail.com", "x+y@z.de", "+t@z.de", "a.b@x.de"]) {
      expect(canonicalEmail(canonicalEmail(email))).toBe(canonicalEmail(email));
    }
  });
});
