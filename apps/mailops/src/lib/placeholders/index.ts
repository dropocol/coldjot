import { Contact } from "@prisma/client";

export interface PlaceholderOptions {
  contact: Contact;
  fallbacks?: Record<string, string>;
}

/**
 * Replaces placeholders in text content with actual values from contact data
 * @param content - The text content containing placeholders (e.g., {{firstName}})
 * @param options - Object containing contact data and optional fallback values
 * @returns The processed text with placeholders replaced with actual values
 */
export function replacePlaceholders(
  content: string,
  options: PlaceholderOptions
): string {
  if (!content) return content;

  const { contact, fallbacks = {} } = options;
  let result = content;

  // Replace contact-based placeholders
  if (contact) {
    const replacements: Record<string, string> = {
      firstName: contact.firstName || fallbacks.firstName || "",
      lastName: contact.lastName || fallbacks.lastName || "",
      name:
        contact.name ||
        `${contact.firstName || ""} ${contact.lastName || ""}`.trim() ||
        fallbacks.name ||
        "",
      email: contact.email || fallbacks.email || "",
    };

    // Replace each placeholder
    Object.entries(replacements).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      result = result.replace(regex, value);
    });
  }

  // Replace any remaining placeholders with fallbacks
  Object.entries(fallbacks).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, "g");
    result = result.replace(regex, value);
  });

  return result;
}

/**
 * Extracts all placeholder variables from a text content
 * @param content - The text content to extract placeholders from
 * @returns Array of placeholder names without the curly braces
 */
export function extractPlaceholders(content: string): string[] {
  if (!content) return [];

  const regex = /{{([^}]+)}}/g;
  const matches = Array.from(content.matchAll(regex), (match) =>
    match[1].trim()
  );
  return [...new Set(matches)]; // Remove duplicates
}

/**
 * Validates if all placeholders in the content have corresponding values
 * @param content - The text content containing placeholders
 * @param options - Object containing contact data and fallback values
 * @returns Array of placeholder names that are missing values
 */
export function validatePlaceholders(
  content: string,
  options: PlaceholderOptions
): string[] {
  const placeholders = extractPlaceholders(content);
  const { contact, fallbacks = {} } = options;

  const missingPlaceholders = placeholders.filter((placeholder) => {
    // Check if the placeholder has a value in contact data or fallbacks
    const hasValue =
      (contact && contact[placeholder as keyof typeof contact]) ||
      fallbacks[placeholder];
    return !hasValue;
  });

  return missingPlaceholders;
}
