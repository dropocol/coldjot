import type { PubSubMessage } from "@coldjot/types";

/**
 * Domain service interface — handles a Gmail PubSub notification by syncing
 * inbox state (classify + apply). Phase 4c replaces PubSubHandler behind this
 * contract.
 */
export interface InboxSyncService {
  handleNotification(message: PubSubMessage): Promise<void>;
}
