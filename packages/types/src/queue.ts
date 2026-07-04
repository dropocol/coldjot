import type { BusinessHours, ProcessingWindow, RateLimits } from "./sequence";
import type {
  BusinessScheduleEnum,
  EmailJobEnum,
  ProcessingJobEnum,
  SequenceHealthStatusType,
  ErrorRecoveryStatusType,
  RetryStrategyBackoffType,
} from "./enums";

// Re-export the enums/type-aliases that pair with the queue surface, so
// `import { ... } from "@coldjot/types/queue"` is self-contained. (Not re-listed
// from the root barrel — see ./index.ts which exports enums separately.)

// ─── Job Types ───────────────────────────────────────────────────────────────

export interface ProcessingJob {
  type: ProcessingJobEnum.SEQUENCE;
  sequenceId: string;
  userId: string;
  scheduleType?: BusinessScheduleEnum;
  businessHours?: BusinessHours;
  testMode?: boolean;
  disableSending?: boolean;
}

export interface EmailJob {
  sequenceId: string;
  contactId: string;
  stepId: string;
  userId: string;
  sequenceMailboxId: string;
  messageId?: string;
  scheduledTime?: string;
  to: string;
  threadId?: string;
  testMode?: boolean;
  disableSending?: boolean;
}

// ─── Monitoring Types ────────────────────────────────────────────────────────

export interface AlertConfig {
  errorThreshold: number;
  warningThreshold: number;
  criticalThreshold: number;
  checkInterval: number;
  retryInterval: number;
  maxRetries: number;
  channels: {
    email?: string[];
    slack?: string[];
    webhook?: string[];
  };
}

export interface AlertThresholds {
  error: number;
  warning: number;
  critical: number;
  bounce?: number;
  delivery?: number;
}

export interface SequenceHealth {
  sequenceId: string;
  status: SequenceHealthStatusType;
  errorCount: number;
  lastCheck: Date;
  lastError?: string;
  metrics: {
    deliveryRate: number;
    bounceRate: number;
    errorRate: number;
    processingTime: number;
  };
}

export interface SystemMetrics {
  queueSize: number;
  processingRate: number;
  errorRate: number;
  cpuUsage: number;
  memoryUsage: number;
  activeWorkers: number;
  jobsCompleted: number;
  jobsFailed: number;
}

// ─── Processing Types ────────────────────────────────────────────────────────

export interface ProcessingResult {
  success: boolean;
  error?: string;
  retryable?: boolean;
  nextRun?: Date;
  data?: any;
}

export interface ProcessingContext {
  job: ProcessingJob | EmailJob;
  attempt: number;
  startTime: Date;
  businessHours?: BusinessHours;
  rateLimits?: RateLimits;
  window?: ProcessingWindow;
}

export interface JobCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface QueueMetrics {
  processingRate: number;
  errorRate: number;
  avgProcessingTime: number;
  throughput: number;
}

// ─── Error Recovery Types ────────────────────────────────────────────────────

export interface RetryStrategy {
  maxRetries: number;
  backoffType: RetryStrategyBackoffType;
  backoffDelay: number; // in milliseconds
  maxDelay?: number; // maximum delay for exponential backoff
  customBackoff?: (attempt: number) => number;
  shouldRetry?: (error: Error) => boolean;
}

export interface ErrorRecovery {
  jobId: string;
  error: string;
  retryCount: number;
  lastRetry: Date;
  nextRetry?: Date;
  strategy: RetryStrategy;
  status: ErrorRecoveryStatusType;
  metadata: Record<string, any>;
}
