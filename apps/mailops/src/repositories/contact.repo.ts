/**
 * Repository interface for the Contact model.
 * Call sites: services/jobs/email/processor (outgoing email).
 */

export interface ContactRecord {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactRepository {
  /** Fetch a contact by id (outgoing email). */
  findById(id: string): Promise<ContactRecord | null>;
}
