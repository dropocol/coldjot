import type { EmailTrackingMetadata } from "@/types/sequences";

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

  console.log("Generated metadata:", metadata);

  return metadata;
}