import type { EmailTrackingMetadata } from "@coldjot/types";

export function generateTrackingMetadata(
  email: string,
  sequenceId: string,
  contactId: string,
  stepId: string,
  userId: string
): EmailTrackingMetadata {
  console.log("Generating tracking metadata with:", {
    email,
    sequenceId,
    contactId,
    stepId,
    userId,
  });

  const metadata: EmailTrackingMetadata = {
    email,
    userId,
    sequenceId,
    stepId,
    contactId,
  };

  return metadata;
}

