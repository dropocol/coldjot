export interface Template {
  id: string;
  userId: string;
  name: string;
  subject: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TemplateWithSections = Template;

// ─── Repository record shapes (mailops v2: lived in template.repo.ts, now here) ─

/** Narrow projection of a Template row read for email send / subject lookup. */
export interface TemplateRecord {
  id: string;
  subject: string | null;
  content: string | null;
}
