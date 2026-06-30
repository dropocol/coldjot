import { ProcessingJobEnum } from "@coldjot/types";
import { MAILOPS_BASE_URL, mailopsAuthHeaders } from "@/lib/http/mailops";

export async function addSequenceToQueue(sequenceId: string, userId: string) {
  const response = await fetch(
    `${MAILOPS_BASE_URL}/api/sequences/${sequenceId}/process`,
    {
      method: "POST",
      headers: {
        ...mailopsAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId }),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to add sequence to queue");
  }

  return response.json();
}

export async function addEmailToQueue(data: {
  sequenceId: string;
  stepId: string;
  contactId: string;
  userId: string;
}) {
  const response = await fetch(`${MAILOPS_BASE_URL}/api/emails/send`, {
    method: "POST",
    headers: {
      ...mailopsAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to add email to queue");
  }

  return response.json();
}

export async function getJobStatus(jobId: string, type: ProcessingJobEnum) {
  const response = await fetch(
    `${MAILOPS_BASE_URL}/api/jobs/${jobId}?type=${type}`,
    {
      method: "GET",
      headers: {
        ...mailopsAuthHeaders(),
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to get job status");
  }

  return response.json();
}
