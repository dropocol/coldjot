/**
 * Repository interface for the Template model.
 * Call sites: lib/email-subject (subject lookup),
 * services/jobs/email/processor (full template fetch).
 */

export interface TemplateRecord {
  id: string;
  subject: string | null;
  content: string | null;
}

export interface TemplateRepository {
  /** Fetch just the subject (email-subject resolution). */
  findSubject(id: string): Promise<string | null>;
  /** Fetch subject + content (email send). */
  findById(id: string): Promise<TemplateRecord | null>;
}
