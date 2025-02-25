export interface EmailEvent {
  id: string;
  type: string;
  timestamp: Date;
  metadata?: any;
}

export interface TrackedLink {
  id: string;
  originalUrl: string;
  clickCount: number;
}

export interface EmailContact {
  name: string;
  email: string;
}

export interface EmailTracking {
  id: string;
  messageId: string;
  subject: string;
  previewText?: string;
  recipientEmail: string;
  status: string;
  metadata: Record<string, any>;
  sequenceId: string;
  stepId: string;
  contactId: string;
  userId: string;
  openCount: number;
  sentAt: Date | null;
  openedAt: Date | null;
  clickedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  contact?: EmailContact | null;
  events: Array<{
    id: string;
    type: string;
    timestamp: Date;
    metadata: Record<string, any>;
  }>;
  links: Array<{
    id: string;
    originalUrl: string;
    clickCount: number;
  }>;
}
