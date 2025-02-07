import {
  PubSub,
  Subscription,
  Message,
  SubscriberOptions,
  CreateSubscriptionOptions,
} from "@google-cloud/pubsub";
import { logger } from "@/lib/log";
import { PUBSUB_CONFIG } from "@/config/pubsub/constants";
import { PubSubHandler } from "./handler";
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
  private pubSubClient: PubSub;
  private subscription!: Subscription;
  private messageHandler: PubSubHandler;
  private isListening: boolean = false;

  private constructor() {
    try {
      const config = this.initializeConfig();
      this.pubSubClient = new PubSub(config);
      this.messageHandler = new PubSubHandler();

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
    try {
      logger.info("Initializing PubSub service...");

      const { topicName, subscriptionName, pushEndpoint } = this.getConfig();

      logger.info(
        { topicName, subscriptionName, pushEndpoint },
        "Checking PubSub configuration"
      );

      const topic = this.pubSubClient.topic(topicName);
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
    return {
      topicName: PUBSUB_CONFIG.TOPIC_NAME,
      subscriptionName: PUBSUB_CONFIG.SUBSCRIPTION_NAME,
      pushEndpoint: PUBSUB_CONFIG.PUBSUB_AUDIENCE,
    };
  }

  private async setupSubscription(
    topic: any,
    subscriptionName: string,
    pushEndpoint: string
  ): Promise<void> {
    const subscriptionOptions: CreateSubscriptionOptions = {
      pushConfig: {
        pushEndpoint,
        oidcToken: {
          serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        },
      },
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
    } else {
      logger.info({ subscriptionName }, "Push subscription already exists");
    }
  }

  // These methods are kept for potential future use with pull subscriptions
  public async startListening(): Promise<void> {
    logger.info("Push subscription is active, no listener needed");
  }

  public async stopListening(): Promise<void> {
    logger.info("Push subscription is active, no listener needed");
  }
}
