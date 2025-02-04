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

export class PubSubService {
  private static instance: PubSubService;
  private pubSubClient: PubSub;
  private subscription!: Subscription;
  private messageHandler: PubSubHandler;
  private isListening: boolean = false;

  private constructor() {
    try {
      // Initialize PubSub client with credentials
      const options: any = {
        projectId: process.env.GOOGLE_CLOUD_PROJECT,
      };

      // First try to load credentials from environment variables
      const credentials = {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
          /\\n/g,
          "\n"
        ),
      };

      if (credentials.client_email && credentials.private_key) {
        options.credentials = credentials;
        logger.info(
          { email: credentials.client_email },
          "Using environment variables for PubSub authentication"
        );
      } else {
        // If env vars not found, try to load from service account key file
        const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (keyFilePath) {
          try {
            const resolvedPath = path.resolve(process.cwd(), keyFilePath);
            if (fs.existsSync(resolvedPath)) {
              const keyFileContent = JSON.parse(
                fs.readFileSync(resolvedPath, "utf8")
              );
              options.credentials = {
                client_email: keyFileContent.client_email,
                private_key: keyFileContent.private_key,
              };
              logger.info(
                { keyPath: resolvedPath, email: keyFileContent.client_email },
                "Using service account key file for PubSub authentication"
              );
            } else {
              throw new Error(
                `Service account key file not found at: ${resolvedPath}`
              );
            }
          } catch (error) {
            logger.error(
              { error, keyPath: keyFilePath },
              "Failed to load service account key file"
            );
            throw error;
          }
        } else {
          throw new Error(
            "No credentials found in environment variables or key file"
          );
        }
      }

      this.pubSubClient = new PubSub(options);
      this.messageHandler = new PubSubHandler();

      logger.info(
        {
          projectId: options.projectId,
          hasCredentials: !!options.credentials,
        },
        "PubSub client initialized"
      );
    } catch (error) {
      logger.error({ error }, "Failed to initialize PubSub client");
      throw error;
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

      // Get topic and subscription paths
      const topicName = PUBSUB_CONFIG.TOPIC_NAME;
      const subscriptionName = PUBSUB_CONFIG.SUBSCRIPTION_NAME;
      const pushEndpoint = PUBSUB_CONFIG.PUBSUB_AUDIENCE;

      logger.info(
        { topicName, subscriptionName, pushEndpoint },
        "Checking PubSub configuration"
      );

      // Get the topic
      const topic = this.pubSubClient.topic(topicName);
      const [topicExists] = await topic.exists();

      if (!topicExists) {
        throw new Error(`Topic ${topicName} does not exist`);
      }

      // Get or create the push subscription
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

  // For push subscriptions, we don't need startListening or stopListening methods
  // as messages will be delivered to our HTTP endpoint
  public async startListening(): Promise<void> {
    logger.info("Push subscription is active, no listener needed");
  }

  public async stopListening(): Promise<void> {
    logger.info("Push subscription is active, no listener needed");
  }
}
