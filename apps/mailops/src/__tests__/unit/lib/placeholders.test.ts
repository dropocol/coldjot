/**
 * Unit tests for the pure placeholder helpers. Ports the Phase 0 Group L
 * characterization assertions into the permanent unit home.
 */
import { describe, it, expect } from "vitest";
import {
  replacePlaceholders,
  extractPlaceholders,
  validatePlaceholders,
  type PlaceholderOptions,
} from "@/lib/placeholders";

const contact = (over: Partial<any> = {}): any => ({
  id: "c1",
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  name: "",
  ...over,
});

describe("replacePlaceholders", () => {
  it("replaces firstName / lastName / email from the contact", () => {
    const out = replacePlaceholders(
      "Hi {{firstName}} {{lastName}} <{{email}}>",
      { contact: contact() }
    );
    expect(out).toBe("Hi Ada Lovelace <ada@example.com>");
  });

  it("composes {{name}} as 'firstName lastName' when contact.name is empty", () => {
    const out = replacePlaceholders("Dear {{name}}", { contact: contact() });
    expect(out).toBe("Dear Ada Lovelace");
  });

  it("uses contact.name directly when set", () => {
    const out = replacePlaceholders("Dear {{name}}", {
      contact: contact({ name: "Countess Ada" }),
    });
    expect(out).toBe("Dear Countess Ada");
  });

  it("falls back to fallbacks.* when a contact field is empty", () => {
    const out = replacePlaceholders("Hi {{firstName}}", {
      contact: contact({ firstName: "" }),
      fallbacks: { firstName: "Friend" },
    });
    expect(out).toBe("Hi Friend");
  });

  it("replaces remaining unknown placeholders via fallbacks", () => {
    const out = replacePlaceholders("Visit {{company}}", {
      contact: contact(),
      fallbacks: { company: "Acme" },
    });
    expect(out).toBe("Visit Acme");
  });

  it("leaves unknown placeholders in place when no value exists", () => {
    const out = replacePlaceholders("Hi {{unknown}}", { contact: contact() });
    expect(out).toBe("Hi {{unknown}}");
  });

  it("returns falsy content unchanged", () => {
    expect(replacePlaceholders("", { contact: contact() })).toBe("");
  });
});

describe("extractPlaceholders", () => {
  it("extracts + dedupes + trims placeholder names", () => {
    const out = extractPlaceholders("{{firstName}} {{firstName}} {{ lastName }}");
    expect(out).toEqual(["firstName", "lastName"]);
  });

  it("returns [] for falsy / empty content", () => {
    expect(extractPlaceholders("")).toEqual([]);
  });
});

describe("validatePlaceholders", () => {
  it("returns [] when every placeholder has a contact value or fallback", () => {
    const out = validatePlaceholders("{{firstName}} {{company}}", {
      contact: contact(),
      fallbacks: { company: "Acme" },
    });
    expect(out).toEqual([]);
  });

  it("reports names that lack both a contact value and a fallback", () => {
    const out = validatePlaceholders("{{firstName}} {{unknown}}", {
      contact: contact(),
    });
    expect(out).toEqual(["unknown"]);
  });

  it("treats an empty-string contact field as MISSING (falsy check divergence)", () => {
    // Pinned divergence: validatePlaceholders uses a falsy check, so "" is
    // treated as missing even though replacePlaceholders would substitute "".
    const out = validatePlaceholders("{{firstName}}", {
      contact: contact({ firstName: "" }),
    });
    expect(out).toEqual(["firstName"]);
  });
});
