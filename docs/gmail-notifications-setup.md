# Setting Up Email Reply Notifications (Optional)

To receive real-time notifications when users reply to emails sent through ColdJot, you can set up Google Cloud PubSub. This section guides you through the process.

> **Prerequisite:** Complete the [Getting Started](./getting-started.md) guide first, including Google OAuth setup.

## Table of Contents

- [1. Create a Google Cloud Service Account](#1-create-a-google-cloud-service-account)
- [2. Configure PubSub Topic and Subscription](#2-configure-pubsub-topic-and-subscription)
- [3. Set Up Tunneling with ngrok](#3-set-up-tunneling-with-ngrok)
- [4. Configure Gmail API to Use Your PubSub Topic](#4-configure-gmail-api-to-use-your-pubsub-topic)
- [5. Update Environment Variables](#5-update-environment-variables)
- [6. Restart Your Development Server](#6-restart-your-development-server)
- [Troubleshooting](#troubleshooting)

## 1. Create a Google Cloud Service Account

1. Go to the [Google Cloud Console Credentials page](https://console.cloud.google.com/apis/credentials)
2. Select your project
3. Click "Create Credentials" and select "Service Account"
4. Give your service account a name (e.g., "coldjot-pubsub")
5. Assign the following roles:
   - Pub/Sub Subscriber
   - Pub/Sub Viewer
   - Pub/Sub Publisher
6. Click "Done" to create the service account
7. Find your new service account in the list and click on it
8. Go to the "Keys" tab and click "Add Key" → "Create new key"
9. Select JSON format and click "Create"
10. Save the downloaded JSON file securely

## 2. Configure PubSub Topic and Subscription

1. In the Google Cloud Console, navigate to [Pub/Sub Topics](https://console.cloud.google.com/cloudpubsub/topic)
2. Click "Create Topic"
3. Name your topic (e.g., "coldjot-email-replies")
4. Click "Create"
5. On the topic details page, click "Create Subscription"
6. Name your subscription (e.g., "coldjot-email-replies-sub")
7. Set the delivery type to "Push"
8. For the endpoint URL, you'll need a public URL that points to your local development environment (we'll set this up in the next step)
9. Under "Authentication", select "Enable authentication"
10. Choose the service account you created earlier
11. Click "Create"

## 3. Set Up Tunneling with ngrok

Since your development environment runs locally, you need a way to receive webhook notifications from Google Cloud. [ngrok](https://ngrok.com/our-product/secure-tunnels) provides a secure tunnel to your localhost.

1. Sign up for a free ngrok account at [ngrok.com](https://ngrok.com)
2. Download and install ngrok
3. Authenticate ngrok with your auth token:

   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

4. Start ngrok to create a tunnel to your mailops service:

   ```bash
   ngrok http 3001
   ```

5. ngrok will provide you with a public URL (e.g., `https://abc123.ngrok.io`)
6. Copy this URL and update your PubSub subscription endpoint URL to:

   ```
   https://YOUR_NGROK_URL/api/webhooks/pubsub
   ```

7. Also update your `.env` file with this URL:

   ```
   PUBSUB_AUDIENCE=https://YOUR_NGROK_URL/api/webhooks/pubsub
   ```

## 4. Configure Gmail API to Use Your PubSub Topic

1. Go back to your PubSub topic in the Google Cloud Console
2. Click on the "Permissions" tab
3. Click "Add Principal"
4. Add `gmail-api-push@system.gserviceaccount.com` as a principal
5. Assign the "Pub/Sub Publisher" role
6. Click "Save"

## 5. Update Environment Variables

Open your `apps/mailops/env/.env.development` file and add the following variables:

```env
# PubSub Configuration
GOOGLE_CLOUD_PROJECT=your-project-id           # Your Google Cloud Project ID
PUBSUB_SUBSCRIPTION_NAME=coldjot-email-replies-sub  # Your subscription name
PUBSUB_TOPIC_NAME=coldjot-email-replies        # Your topic name
PUBSUB_AUDIENCE=https://YOUR_NGROK_URL/api/webhooks/pubsub  # Your ngrok URL + path

# Google Service Account (from the downloaded JSON key file)
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key content\n-----END PRIVATE KEY-----\n"
```

> [!NOTE]
> For the private key, make sure to:
>
> 1. Include the entire key including the BEGIN and END lines
> 2. Replace newlines with `\n` characters
> 3. Enclose the entire key in double quotes

## 6. Restart Your Development Server

After configuring everything, restart your development server to apply the changes:

```bash
npm run dev
```

## Troubleshooting

- **Webhook Verification Errors**: Ensure your ngrok URL is correctly set in both the PubSub subscription and your environment variables.
- **Authentication Issues**: Verify that your service account has the correct permissions and that the key is properly formatted in your `.env` file.
- **No Notifications**: Check that the Gmail API is properly configured to use your PubSub topic and that the `gmail-api-push@system.gserviceaccount.com` account has publisher permissions.
- **ngrok Connection Issues**: Make sure ngrok is running and that you're using the current URL (ngrok URLs change each time you restart unless you have a paid plan).

---

`gmail-api-push@system.gserviceaccount.com` must be added as a Pub/Sub Publisher on your topic for Gmail push notifications to work.
