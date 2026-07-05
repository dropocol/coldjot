/**
 * Repository interface for the Contact model.
 * Call sites: services/jobs/email/processor (outgoing email).
 */

export interface ContactRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
}

export interface ContactRepository {
  /** Fetch a contact by id (outgoing email). */
  findById(id: string): Promise<ContactRecord | null>;
}
