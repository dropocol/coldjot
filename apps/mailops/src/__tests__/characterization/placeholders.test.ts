/**
 * Group L — placeholders characterization tests.
 *
 * Pins the CURRENT behavior of lib/placeholders/index.ts so the upcoming
 * refactor (Phases 1+) can be proven non-breaking. These are pure functions
 * — no Prisma, no Gmail, no transport — so no fake harness is needed.
 *
 * Three surfaces are pinned:
 *   - replacePlaceholders(content, options) — value substitution
 *   - extractPlaceholders(content)          — list of placeholder names
 *   - validatePlaceholders(content, options) — names lacking a value
 *
 * Source: lib/placeholders/index.ts (lines 1–90).
 */
import {
  replacePlaceholders,
  extractPlaceholders,
  validatePlaceholders,
} from "@/lib/placeholders";
import type { Contact } from "@prisma/client";

/** Minimal Contact fixture — only the fields placeholders/index.ts reads. */
function makeContact(over: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    firstName: "Ada",
    lastName: "Lovelace",
    name: "Ada Lovelace",
    email: "ada@example.com",
    ...over,
  } as Contact;
}

// ------------------------------------------------------------------------
// replacePlaceholders
// ------------------------------------------------------------------------

describe("[Group L] replacePlaceholders", () => {
  it("substitutes firstName / lastName / name / email from contact", () => {
    const out = replacePlaceholders(
      "Hi {{firstName}} {{lastName}} ({{email}}), sent to {{name}}.",
      { contact: makeContact() }
    );
    expect(out).toBe(
      "Hi Ada Lovelace (ada@example.com), sent to Ada Lovelace."
    );
  });

  it("falls back to fallbacks.* when the contact field is empty/missing", () => {
    // firstName + lastName empty → fallbacks used; email missing entirely → fallback
    const contact = makeContact({
      firstName: "",
      lastName: "",
      email: "",
    });
    const out = replacePlaceholders("{{firstName}} {{lastName}} {{email}}", {
      contact,
      fallbacks: {
        firstName: "Friend",
        lastName: "Unknown",
        email: "no-reply@x.com",
      },
    });
    expect(out).toBe("Friend Unknown no-reply@x.com");
  });

  it("composes name as 'firstName lastName' (trimmed) when contact.name is empty", () => {
    const contact = makeContact({ name: "", firstName: "Grace", lastName: "" });
    expect(replacePlaceholders("Hello {{name}}", { contact })).toBe(
      "Hello Grace"
    );
  });

  it("replaces remaining unknown placeholders via fallbacks (any key)", () => {
    const out = replacePlaceholders("Visit {{company}} — {{firstName}}", {
      contact: makeContact(),
      fallbacks: { company: "Acme" },
    });
    expect(out).toBe("Visit Acme — Ada");
  });

  it("returns falsy content unchanged (empty string, etc.)", () => {
    // Empty string is falsy → truthy guard returns it unchanged.
    expect(replacePlaceholders("", { contact: makeContact() })).toBe("");
    // leaves unknown placeholders in place when no value exists
    expect(
      replacePlaceholders("Hi {{unknown}}!", { contact: makeContact() })
    ).toBe("Hi {{unknown}}!");
  });
});

// ------------------------------------------------------------------------
// extractPlaceholders
// ------------------------------------------------------------------------

describe("[Group L] extractPlaceholders", () => {
  it("returns deduped, trimmed placeholder names", () => {
    const out = extractPlaceholders(
      "{{firstName}} - {{ lastName }} - {{firstName}} - {{company}}"
    );
    expect(out).toEqual(["firstName", "lastName", "company"]);
  });

  it("returns [] for falsy content", () => {
    // Empty string is falsy → guard returns [].
    expect(extractPlaceholders("")).toEqual([]);
    expect(extractPlaceholders("no placeholders here")).toEqual([]);
  });
});

// ------------------------------------------------------------------------
// validatePlaceholders
// ------------------------------------------------------------------------

describe("[Group L] validatePlaceholders", () => {
  it("returns [] when every placeholder has a contact value or fallback", () => {
    expect(
      validatePlaceholders("{{firstName}} {{company}}", {
        contact: makeContact(),
        fallbacks: { company: "Acme" },
      })
    ).toEqual([]);
  });

  it("reports placeholders that have neither contact value nor fallback", () => {
    expect(
      validatePlaceholders("{{firstName}} {{unknown}} {{missing}}", {
        contact: makeContact(),
      })
    ).toEqual(["unknown", "missing"]);
  });

  it("treats an empty-string contact field as MISSING (falsy check divergence)", () => {
    // validatePlaceholders uses `contact[field] || fallbacks[field]`; an empty
    // string is falsy, so it's reported missing even though the field exists.
    // This diverges from replacePlaceholders, which would substitute "".
    const contact = makeContact({ firstName: "" });
    expect(
      validatePlaceholders("{{firstName}}", { contact })
    ).toEqual(["firstName"]);
  });
});
