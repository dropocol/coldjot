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
  messageId: string;
  labelIds?: string[];
  from?: string; // Added for tracking message sender
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

export interface GmailHistoryRecord {
  id: string;
  messages?: Array<{
    id: string;
    threadId: string;
    labelIds: string[];
  }>;
  messagesAdded?: Array<{
    message: {
      id: string;
      threadId: string;
      labelIds: string[];
    };
  }>;
  labelsAdded?: Array<{
    message: {
      id: string;
      threadId: string;
    };
    labelIds: string[];
  }>;
}

export interface GmailMessageMetadata {
  id: string;
  threadId: string;
  labelIds: string[];
  sizeEstimate: number;
  payload: {
    headers: Array<{
      name: string;
      value: string;
    }>;
    body?: {
      size: number;
      data?: string;
    };
    parts?: Array<{
      body: {
        size: number;
        data?: string;
      };
    }>;
  };
}
