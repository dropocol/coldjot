import type { PubSubMessage } from "@coldjot/types";

/**
 * Adapter interface — abstracts the Google PubSub subscription lifecycle
 * behind a start/stop contract. The current implementation lives in
 * `services/pubsub/client.ts` (PubSubService); Phase 4c routes its
 * notifications through InboxSyncService.
 */
export interface PubSubClient {
  /** Establish the underlying subscription. Idempotent. */
  initialize(): Promise<void>;
  /** Register the handler invoked for each incoming notification. */
  startListening(handler: (message: PubSubMessage) => Promise<void>): Promise<void>;
  /** Tear down the subscription. Idempotent. */
  stopListening(): Promise<void>;
}
