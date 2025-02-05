export const GMAIL_API = {
  HISTORY: "https://gmail.googleapis.com/gmail/v1/users/me/history",
  MESSAGES: "https://gmail.googleapis.com/gmail/v1/users/me/messages",
  WATCH: "https://gmail.googleapis.com/gmail/v1/users/me/watch",
  STOP: "https://gmail.googleapis.com/gmail/v1/users/me/stop",
} as const;

// Required Gmail API scopes
export const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.metadata",
] as const;

// Gmail labels
export const GMAIL_LABELS = {
  INBOX: "INBOX",
  SENT: "SENT",
  DRAFT: "DRAFT",
  TRASH: "TRASH",
  SPAM: "SPAM",
  CATEGORY_UPDATES: "CATEGORY_UPDATES",
  CATEGORY_PROMOTIONS: "CATEGORY_PROMOTIONS",
  CATEGORY_SOCIAL: "CATEGORY_SOCIAL",
  CATEGORY_FORUMS: "CATEGORY_FORUMS",
} as const;
