export interface PubSubMessage {
  data: string; // Base64 encoded data
  messageId: string;
  publishTime: string;
  attributes?: Record<string, string>;
}

export interface PubSubPushRequest {
  message: PubSubMessage;
  subscription: string;
}

export enum NotificationType {
  MESSAGE_ADDED = "MESSAGE_ADDED",
  MESSAGE_DELETED = "MESSAGE_DELETED",
  LABEL_ADDED = "LABEL_ADDED",
  LABEL_REMOVED = "LABEL_REMOVED",
  BOUNCE = "BOUNCE",
  REPLY = "REPLY",
}

export interface GmailNotification {
  emailAddress: string;
  historyId: string;
}

export interface HistoryChange {
  id: string;
  threadId: string;
  type: NotificationType;
  labelIds?: string[];
  messageId?: string;
}

export interface NotificationRecord {
  id: string;
  emailWatchId: string;
  historyId: string;
  notificationType: NotificationType;
  processed: boolean;
  createdAt: Date;
  data?: Record<string, any>;
}
