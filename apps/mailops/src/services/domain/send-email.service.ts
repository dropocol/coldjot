import type { SendEmailOptions, EmailResult } from "@coldjot/types";

/**
 * Domain service interface — sends an email and writes the tracking row +
 * SENT event. Phase 4a replaces EmailService behind this contract.
 */
export interface SendEmailService {
  send(options: SendEmailOptions): Promise<EmailResult>;
}
