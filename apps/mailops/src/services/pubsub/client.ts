import {
  PubSub,
  Subscription,
  Message,
  SubscriberOptions,
  CreateSubscriptionOptions,
} from "@google-cloud/pubsub";
import { logger } from "@/lib/log";
import { env } from "@/config/env";
import { PUBSUB_CONFIG } from "@/config/pubsub/constants";
import path from "path";
import fs from "fs";

interface PubSubCredentials {
  client_email: string;
  private_key: string;
}

interface PubSubServiceConfig {
  projectId: string;
  credentials?: PubSubCredentials;
  keyFilePath?: string;
}

export class PubSubService {
  private static instance: PubSubService;
  private pubSubClient: PubSub | null = null;
  private subscription!: Subscription;
  private isListening: boolean = false;
  private readonly enabled: boolean;

  private constructor() {
    this.enabled = env.MAILOPS_PUBSUB_ENABLED;
    if (!this.enabled) {
      logger.warn(
        "PubSub service is DISABLED (MAILOPS_PUBSUB_ENABLED=false). " +
          "No client will be constructed and no GRPC calls will be made. " +
          "Gmail push notifications will not be received."
      );
      return;
    }

    try {
      const config = this.initializeConfig();
      this.pubSubClient = new PubSub(config);

      logger.info(
        {
          projectId: config.projectId,
          hasCredentials: !!config.credentials,
        },
        "PubSub client initialized"
      );
    } catch (error) {
      logger.error({ error }, "Failed to initialize PubSub client");
      throw error;
    }
  }

  private initializeConfig(): PubSubServiceConfig {
    const config: PubSubServiceConfig = {
      projectId: process.env.GOOGLE_CLOUD_PROJECT!,
    };

    // Try environment variables first
    const envCredentials = this.getEnvCredentials();
    if (envCredentials) {
      config.credentials = envCredentials;
      logger.info(
        { email: envCredentials.client_email },
        "Using environment variables for PubSub authentication"
      );
      return config;
    }

    // Fall back to key file
    const keyFileCredentials = this.getKeyFileCredentials();
    if (keyFileCredentials) {
      config.credentials = keyFileCredentials;
      logger.info(
        { email: keyFileCredentials.client_email },
        "Using service account key file for PubSub authentication"
      );
      return config;
    }

    throw new Error("No valid credentials found for PubSub initialization");
  }

  private getEnvCredentials(): PubSubCredentials | null {
    const client_email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const private_key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
      /\\n/g,
      "\n"
    );

    if (client_email && private_key) {
      return { client_email, private_key };
    }

    return null;
  }

  private getKeyFileCredentials(): PubSubCredentials | null {
    const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!keyFilePath) return null;

    try {
      const resolvedPath = path.resolve(process.cwd(), keyFilePath);
      if (!fs.existsSync(resolvedPath)) {
        logger.warn(
          { path: resolvedPath },
          "Service account key file not found"
        );
        return null;
      }

      const keyFileContent = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
      return {
        client_email: keyFileContent.client_email,
        private_key: keyFileContent.private_key,
      };
    } catch (error) {
      logger.error(
        { error, keyPath: keyFilePath },
        "Failed to load service account key file"
      );
      return null;
    }
  }

  public static getInstance(): PubSubService {
    if (!PubSubService.instance) {
      PubSubService.instance = new PubSubService();
    }
    return PubSubService.instance;
  }

  public async initialize(): Promise<void> {
    if (!this.enabled) {
      logger.info("PubSub service disabled — skipping initialization");
      return;
    }

    if (!PUBSUB_CONFIG.PUBSUB_AUDIENCE) {
      throw new Error(
        "PUBSUB_AUDIENCE is required when MAILOPS_PUBSUB_ENABLED=true " +
          "(set it to your public push endpoint URL)"
      );
    }

    try {
      logger.info("Initializing PubSub service...");

      const { topicName, subscriptionName, pushEndpoint } = this.getConfig();

      logger.info(
        { topicName, subscriptionName, pushEndpoint },
        "Checking PubSub configuration"
      );

      const client = this.pubSubClient;
      if (!client) throw new Error("PubSub client not initialized");

      const topic = client.topic(topicName);
      const [topicExists] = await topic.exists();

      if (!topicExists) {
        throw new Error(`Topic ${topicName} does not exist`);
      }

      await this.setupSubscription(topic, subscriptionName, pushEndpoint);

      this.isListening = true;
      logger.info("PubSub service initialized successfully");
    } catch (error) {
      logger.error(
        {
          error,
          projectId: process.env.GOOGLE_CLOUD_PROJECT,
          subscriptionName: PUBSUB_CONFIG.SUBSCRIPTION_NAME,
          serviceAccount: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        },
        "Failed to initialize PubSub service"
      );
      throw error;
    }
  }

  private getConfig() {
    // PUBSUB_AUDIENCE is verified non-empty at the top of initialize(); the `!`
    // reflects that guard. No hardcoded fallback (see config/pubsub/constants.ts).
    return {
      topicName: PUBSUB_CONFIG.TOPIC_NAME,
      subscriptionName: PUBSUB_CONFIG.SUBSCRIPTION_NAME,
      pushEndpoint: PUBSUB_CONFIG.PUBSUB_AUDIENCE!,
    };
  }

  private async setupSubscription(
    topic: any,
    subscriptionName: string,
    pushEndpoint: string
  ): Promise<void> {
    const subscriptionOptions: CreateSubscriptionOptions = {
      pushConfig: this.buildPushConfig(pushEndpoint),
      ackDeadlineSeconds: PUBSUB_CONFIG.ACK_DEADLINE_SECONDS,
    };

    this.subscription = topic.subscription(subscriptionName);
    const [exists] = await this.subscription.exists();

    if (!exists) {
      logger.info(
        { subscriptionName, pushEndpoint },
        "Creating new push subscription"
      );
      [this.subscription] = await topic.createSubscription(
        subscriptionName,
        subscriptionOptions
      );
      return;
    }

    // Subscription exists — reconcile its push endpoint so the env var is
    // authoritative. Without this, changing PUBSUB_AUDIENCE silently leaves
    // Google pushing to the stale URL (the subscription "already exists" branch
    // used to no-op).
    await this.reconcilePushEndpoint(this.subscription, pushEndpoint);
  }

  /**
   * Shared push-config shape for both create + modify. Pub/Sub *replaces* the
   * whole pushConfig on modifyPushConfig (not a merge), so create and reconcile
   * must send identical config — extract it once to prevent drift.
   */
  private buildPushConfig(pushEndpoint: string) {
    return {
      pushEndpoint,
      oidcToken: {
        serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      },
    };
  }

  /**
   * Compare the subscription's live push endpoint to the configured one and
   * update Google if they drifted. Makes PUBSUB_AUDIENCE the source of truth:
   * change it in env, reboot mailops, and the subscription updates itself —
   * no manual GCP Console edit.
   */
  private async reconcilePushEndpoint(
    subscription: Subscription,
    desiredEndpoint: string
  ): Promise<void> {
    const [metadata] = await subscription.getMetadata();
    const currentEndpoint = metadata.pushConfig?.pushEndpoint;

    if (currentEndpoint === desiredEndpoint) {
      logger.info(
        { subscriptionName: metadata.name, pushEndpoint: currentEndpoint },
        "Push subscription already up to date"
      );
      return;
    }

    logger.info(
      { from: currentEndpoint, to: desiredEndpoint },
      "Push endpoint changed — updating subscription"
    );
    await subscription.modifyPushConfig({
      pushEndpoint: desiredEndpoint,
      oidcToken: {
        serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      },
    });
    logger.info({ pushEndpoint: desiredEndpoint }, "Push endpoint updated");
  }

  // These methods are kept for potential future use with pull subscriptions
  public async startListening(): Promise<void> {
    logger.info("Push subscription is active, no listener needed");
  }

  public async stopListening(): Promise<void> {
    logger.info("Push subscription is active, no listener needed");
  }
}
