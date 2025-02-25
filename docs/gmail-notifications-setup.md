# Gmail Notifications Setup Guide

This guide explains how to set up Gmail notifications using Google Cloud PubSub and Gmail API push notifications.

## Prerequisites

- Google Cloud Project
- Gmail API enabled
- Cloud PubSub API enabled
- Service account with proper permissions
- Domain-wide delegation configured (for workspace accounts)

## 1. Service Account Setup

1. Create a service account in Google Cloud Console:

   ```bash
   # Create service account
   gcloud iam service-accounts create coldjot-service-account-dev \
     --display-name="ColdJot Service Account Dev"
   ```

2. Grant required roles:

   ```bash
   # Add required roles
   gcloud projects add-iam-policy-binding radiant-clone-447816-m7 \
     --member="serviceAccount:coldjot-service-account-dev@radiant-clone-447816-m7.iam.gserviceaccount.com" \
     --role="roles/pubsub.publisher"

   gcloud projects add-iam-policy-binding radiant-clone-447816-m7 \
     --member="serviceAccount:coldjot-service-account-dev@radiant-clone-447816-m7.iam.gserviceaccount.com" \
     --role="roles/pubsub.subscriber"

   gcloud projects add-iam-policy-binding radiant-clone-447816-m7 \
     --member="serviceAccount:coldjot-service-account-dev@radiant-clone-447816-m7.iam.gserviceaccount.com" \
     --role="roles/pubsub.viewer"
   ```

3. Enable Domain-Wide Delegation:
   - Go to Google Cloud Console > IAM & Admin > Service Accounts
   - Find your service account and enable Domain-Wide Delegation
   - Add the following OAuth scopes in Google Workspace Admin:
     ```
     https://www.googleapis.com/auth/gmail.modify
     https://www.googleapis.com/auth/gmail.readonly
     https://www.googleapis.com/auth/gmail.metadata
     ```

## 2. PubSub Setup

1. Create the topic:

   ```bash
   # Create PubSub topic
   gcloud pubsub topics create coldjot-gmail-notification
   ```

2. Grant permissions:

   ```bash
   # Allow service account to publish
   gcloud pubsub topics add-iam-policy-binding coldjot-gmail-notification \
     --member="serviceAccount:coldjot-service-account-dev@radiant-clone-447816-m7.iam.gserviceaccount.com" \
     --role="roles/pubsub.publisher"

   # Allow Gmail API to publish
   gcloud pubsub topics add-iam-policy-binding coldjot-gmail-notification \
     --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
     --role="roles/pubsub.publisher"
   ```

3. Create push subscription:

   ```bash
   # Create subscription with push endpoint
   gcloud pubsub subscriptions create coldjot-subscription \
     --topic coldjot-gmail-notification \
     --push-endpoint=https://your-domain.com/pubsub \
     --message-retention-duration=7d \
     --ack-deadline=60
   ```

4. Grant subscription permissions:
   ```bash
   # Allow service account to subscribe
   gcloud pubsub subscriptions add-iam-policy-binding coldjot-subscription \
     --member="serviceAccount:coldjot-service-account-dev@radiant-clone-447816-m7.iam.gserviceaccount.com" \
     --role="roles/pubsub.subscriber"
   ```

## 3. Environment Configuration

Add the following to your `.env` file:

```env
# Google Cloud Project
GOOGLE_CLOUD_PROJECT=radiant-clone-447816-m7

# PubSub Configuration
PUBSUB_SUBSCRIPTION_NAME=coldjot-subscription
PUBSUB_TOPIC_NAME=coldjot-gmail-notification
PUBSUB_AUDIENCE=https://your-domain.com/pubsub

# Service Account
GOOGLE_SERVICE_ACCOUNT_EMAIL=coldjot-service-account-dev@radiant-clone-447816-m7.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="your-private-key"
```

## 4. Watch Setup Implementation

The watch setup requires:

1. Gmail OAuth2 credentials for the user
2. PubSub topic properly configured
3. Push subscription endpoint accessible

Key implementation points:

```typescript
const watchRequest = {
  userId: "me",
  requestBody: {
    labelIds: ["INBOX"],
    topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT}/topics/${process.env.PUBSUB_TOPIC_NAME}`,
    labelFilterAction: "include",
  },
};
```

## 5. Verification

1. Check topic permissions:

   ```bash
   gcloud pubsub topics get-iam-policy coldjot-gmail-notification
   ```

2. Check subscription:

   ```bash
   gcloud pubsub subscriptions get-iam-policy coldjot-subscription
   ```

3. Verify endpoint accessibility:
   ```bash
   curl -X POST https://your-domain.com/pubsub \
     -H "Content-Type: application/json" \
     -d '{"message": "test"}'
   ```

## Troubleshooting

1. **403 Unauthorized Error**: Check service account permissions and OAuth scopes
2. **PubSub Connection Issues**: Verify endpoint is publicly accessible
3. **Watch Setup Fails**: Ensure Gmail API is enabled and has proper permissions
4. **No Notifications**: Check subscription configuration and acknowledgment

## Security Considerations

1. Always use HTTPS for push endpoints
2. Implement proper authentication for your endpoints
3. Keep service account keys secure
4. Regularly rotate credentials
5. Monitor API quotas and usage

## Maintenance

1. Watches expire after 7 days - implement renewal logic
2. Monitor failed deliveries and handle retries
3. Implement proper error handling and logging
4. Set up monitoring for the subscription
5. Regular testing of the notification flow

gmail-api-push@system.gserviceaccount.com is needed in Pub/Sub roles with publisher access
