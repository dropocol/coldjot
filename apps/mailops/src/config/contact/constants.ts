export const CONTACT_PROCESSING_CONFIG = {
  CHECK_INTERVAL: 15000, // 15 seconds
  BATCH_SIZE: 100,
} as const;

export type ContactProcessingConfig = typeof CONTACT_PROCESSING_CONFIG;
