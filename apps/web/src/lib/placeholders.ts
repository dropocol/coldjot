import { Contact } from "@prisma/client";

export interface PlaceholderContext {
  contact?: Contact | null;
  fallbacks: Record<string, string>;
  customValues?: Record<string, string>;
}

export function replacePlaceholders(
  content: string,
  context: PlaceholderContext
): string {
  let result = content;

  // Replace contact-based placeholders
  if (context.contact) {
    result = result
      .replace(/{{name}}/g, context.contact.name)
      .replace(/{{email}}/g, context.contact.email);
  }

  // Replace custom values
  if (context.customValues) {
    Object.entries(context.customValues).forEach(([key, value]) => {
      result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
    });
  }

  // Replace remaining placeholders with fallbacks
  Object.entries(context.fallbacks).forEach(([key, value]) => {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  });

  return result;
}

export function validatePlaceholders(content: string): string[] {
  if (!content) return [];

  const placeholderRegex = /{{([^}]+)}}/g;
  const matches = Array.from(
    content.matchAll(placeholderRegex) || [],
    (match) => match[1]
  );
  const missingPlaceholders = new Set<string>(matches);

  return Array.from(missingPlaceholders);
}
