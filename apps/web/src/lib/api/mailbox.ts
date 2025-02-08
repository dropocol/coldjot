interface WatchRequestBody {
  userId: string;
  email: string;
}

export async function startMailboxWatch(
  userId: string,
  email: string
): Promise<void> {
  const response = await fetch("/api/mailbox/watch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId, email }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to start mailbox watch");
  }
}

export async function stopMailboxWatch(email: string): Promise<void> {
  const response = await fetch(
    `/api/mailbox/watch/${encodeURIComponent(email)}`,
    {
      method: "DELETE",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to stop mailbox watch");
  }
}
