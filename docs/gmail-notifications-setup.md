# Setting Up Email Reply Notifications (Optional)

To receive real-time notifications when users reply to emails sent through ColdJot, you can set up Google Cloud PubSub. This section guides you through the process.

> **Prerequisite:** Complete the [Getting Started](./getting-started.md) guide first, including Google OAuth setup.

## Table of Contents

- [1. Create a Google Cloud Service Account](#1-create-a-google-cloud-service-account)
- [2. Configure PubSub Topic and Subscription](#2-configure-pubsub-topic-and-subscription)
- [3. Set Up a Stable Dev Tunnel](#3-set-up-a-stable-dev-tunnel)
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

## 3. Set Up a Stable Dev Tunnel

Google Pub/Sub needs a public HTTPS URL to push notifications to, pointing at your local mailops. Set up a **Cloudflare Tunnel** once and reuse the same URL forever (across reboots, network changes, IP changes) — see [Setting Up a Stable Dev Tunnel](./dev-tunnel.md) for the full steps.

Once your tunnel is running, your stable push endpoint is:

```
https://dev.<your-domain>/api/pubsub
```

Use that URL when creating the Pub/Sub subscription in step 2, and as `PUBSUB_AUDIENCE` in your env. The path is `/api/pubsub` (also mounted at `/pubsub`).

> [!NOTE]
> The push endpoint you register in Google and the `PUBSUB_AUDIENCE` env value must be **identical** — mailops verifies the incoming Google JWT's `aud` claim against `PUBSUB_AUDIENCE`. On first boot after a URL change, mailops reconciles the subscription's push endpoint automatically via `modifyPushConfig` (no manual GCP Console edit).

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
PUBSUB_AUDIENCE=https://dev.<your-domain>/api/pubsub  # Your Cloudflare Tunnel host + path (see docs/dev-tunnel.md)

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

- **Webhook Verification Errors (401)**: `PUBSUB_AUDIENCE` must exactly match the push endpoint registered in Google. Run `cloudflared tunnel run` (or confirm the launchd service is up) and check mailops logs for "Push endpoint updated" on boot.
- **Authentication Issues**: Verify that your service account has the correct permissions and that the key is properly formatted in your `.env` file.
- **No Notifications**: Check that the Gmail API is properly configured to use your PubSub topic and that the `gmail-api-push@system.gserviceaccount.com` account has publisher permissions.
- **Push endpoint not updating**: mailops reconciles the endpoint on boot — restart mailops after changing `PUBSUB_AUDIENCE`. If it still doesn't update, confirm the service account has the Pub/Sub Editor IAM role (`modifyPushConfig` requires it).
- **Tunnel not reachable**: `dig +short dev.<your-domain>` must return Cloudflare IPs and `cloudflared tunnel run` must be connected. The hostname is stable across reboots by design — see [dev-tunnel.md](./dev-tunnel.md).

---

`gmail-api-push@system.gserviceaccount.com` must be added as a Pub/Sub Publisher on your topic for Gmail push notifications to work.
