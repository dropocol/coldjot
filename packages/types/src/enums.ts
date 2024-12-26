export enum ProcessingJobEnum {
  SEQUENCE = "sequence",
  EMAIL = "email",
  THREAD = "thread",
}

export enum BusinessScheduleEnum {
  BUSINESS = "business",
  CUSTOM = "custom",
}

export enum ContactStatusEnum {
  COMPLETED = "completed",
  OPTED_OUT = "opted_out",
  PENDING = "pending",
  FAILED = "failed",
  SKIPPED = "skipped",
  SENT = "sent",
  READ = "read",
  REPLIED = "replied",
}

export enum EmailJobEnum {
  SEND = "send",
  BOUNCE_CHECK = "bounce_check",
}

export enum EmailTrackingEnum {
  SEQUENCE = "sequence",
  CAMPAIGN = "campaign",
}

// TODO: combine with EmailTrackingStatusEnum
// Define EmailEventType based on the schema enum
export enum EmailEventEnum {
  SENT = "sent",
  OPENED = "opened",
  CLICKED = "clicked",
  REPLIED = "replied",
  BOUNCED = "bounced",
  SPAM = "spam",
  UNSUBSCRIBED = "unsubscribed",
  INTERESTED = "interested",
}

export type EmailEventType = EmailEventEnum;

export enum EmailTrackingStatusEnum {
  PENDING = "pending",
  SENT = "sent",
  OPENED = "opened",
  CLICKED = "clicked",
  BOUNCED = "bounced",
  SPAM = "spam",
  UNSUBSCRIBED = "unsubscribed",
}

export type EmailTrackingStatus = EmailTrackingStatusEnum;

export enum EmailLabelEnum {
  INBOX = "INBOX",
  IMPORTANT = "IMPORTANT",
  UNREAD = "UNREAD",
  TRASH = "TRASH",
  SPAM = "SPAM",
  JUNK = "JUNK",
  DRAFT = "DRAFT",
  SENT = "SENT",
  CATEGORY_PERSONAL = "CATEGORY_PERSONAL",
  CATEGORY_SOCIAL = "CATEGORY_SOCIAL",
  CATEGORY_PROMOTIONS = "CATEGORY_PROMOTIONS",
  CATEGORY_UPDATES = "CATEGORY_UPDATES",
  CATEGORY_FORUMS = "CATEGORY_FORUMS",
}

export enum SequenceContactStatusEnum {
  ACTIVE = "active",
  PAUSED = "paused",
  COMPLETED = "completed",
  BOUNCED = "bounced",
  OPTED_OUT = "opted_out",
  NOT_STARTED = "not_started",
  SKIPPED = "skipped",
  FAILED = "failed",
  PENDING = "pending",
  SENT = "sent",
  READ = "read",
  REPLIED = "replied",
  IN_PROGRESS = "in_progress",
  ERROR = "error",
  SCHEDULED = "scheduled",
}

export type SequenceContactStatusType = SequenceContactStatusEnum;
