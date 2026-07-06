# Getting Started

This guide walks you through setting up ColdJot for local development.

> For a high-level overview, see the [root README](../README.md). For other docs, see the [docs index](./README.md).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Services with Docker](#local-services-with-docker)
- [Google OAuth Setup](#google-oauth-setup)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running Locally](#running-locally)

## Prerequisites

**Required Versions:**

- Node.js >= 20.0.0
- npm >= 8.0.0 (or yarn)
- Docker >= 20.10.0 (for local services)
- PostgreSQL >= 14.0.0 (if not using Docker)
- Redis >= 6.0.0 (if not using Docker)

## Local Services with Docker

Before running the application, you'll need PostgreSQL and Redis running locally.

1. Make sure you have [Docker](https://docs.docker.com/get-docker/) and [Node.js](https://nodejs.org/en/download/) installed.
2. Run the following commands to install dependencies and start the local services:

   ```bash
   npm install
   docker compose up -d
   ```

   This starts:
   - **PostgreSQL** (`postgres:17-alpine`) on port `5432` — database `coldjot_dev`
   - **Redis** (`redis:7-alpine`) on port `6379` — with AOF persistence

3. If you encounter any issues, try cleaning up:

   ```bash
   docker compose down
   rm -rf node_modules
   rm package-lock.json
   ```

## Google OAuth Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. Create a new project.
3. Add the following APIs in your Google Cloud Project:
   - [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
   - [Cloud Pub/Sub API](https://console.cloud.google.com/apis/library/pubsub.googleapis.com)
4. Create two OAuth 2.0 credentials (Web application type):
   - One for **login** with the basic scopes for user authentication.
   - Another for **mailboxes** with the required scopes for accessing mailbox data.
5. Add authorized redirect URIs:
   - Login:
     - `http://localhost:3000/api/auth/callback/google`
   - Mailboxes:
     - `http://localhost:3000/api/mailboxes/gmail/callback`

> [!WARNING]
> The redirect URIs must match **exactly** what you configure in the Google Cloud Console, including the protocol (http/https), domain, and path.

## Environment Variables

1. Copy the example env files:

   ```bash
   # Copy example env files
   cp apps/web/env/.env.example apps/web/env/.env.development
   cp apps/mailops/env/.env.example apps/mailops/env/.env.development
   cp packages/database/env/.env.example packages/database/env/.env.development
   ```

2. Configure the environment variables in each `.env.development` file:

### Web Application (`apps/web/env/.env.development`)

```env
# General
LOG_LEVEL=debug                                         # Log level
APP_ENV=development                                     # App environment
NODE_ENV=development                                    # Node environment
NEXT_PUBLIC_APP_ENV=development                         # Next public app environment

# URLs
NEXTAUTH_URL=http://localhost:3000                      # Next auth url
NEXT_PUBLIC_APP_URL=http://localhost:3000               # Next public app url
NEXT_PUBLIC_MAILOPS_API_URL="http://localhost:3001/api" # Next public mailops api url

# Secrets
NEXTAUTH_SECRET=your_random_secret_key                  # Use `openssl rand -hex 32` to generate
ENCRYPTION_KEY=                                         # Encryption key
AUTH_TRUST_HOST=                                        # Auth trust host

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coldjot_dev

# Google OAuth2 (Required for Authentication)
GOOGLE_CLIENT_ID=                                       # Google client id
GOOGLE_CLIENT_SECRET=                                   # Google client secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/callback/google

# Google Mailbox OAuth2 (Required for Email Integration)
GOOGLE_CLIENT_ID_EMAIL=                                 # Google client id for email
GOOGLE_CLIENT_SECRET_EMAIL=                             # Google client secret for email
GOOGLE_REDIRECT_URI_EMAIL=http://localhost:3000/api/mailboxes/gmail/callback
```

### Mail Operations Service (`apps/mailops/env/.env.development`)

```env
# General Configuration
LOG_LEVEL=debug                         # debug, info, warn, error
APP_ENV=development                     # development, production
NODE_ENV=development                    # development, production
PORT=3001                              # Port for the mailops api
BYPASS_BUSINESS_HOURS=false            # Bypass business hours check in code

# URLs
WEB_APP_URL=http://localhost:3000      # URL for the web app
MAILOPS_API_URL=http://localhost:3001  # URL for the mailops api
TRACK_API_URL=https://coldjot.loca.lt  # URL for the tracking in the email

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coldjot_dev

# Redis Configuration
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                        # Redis port
REDIS_PASSWORD=                        # Redis password (if any)

# Queue Configuration
QUEUE_PREFIX=coldjot                   # Prefix for the queue

# Google Mailbox OAuth2
GOOGLE_CLIENT_ID_EMAIL=                # Google client ID for email
GOOGLE_CLIENT_SECRET_EMAIL=            # Google client secret for email
GOOGLE_REDIRECT_URI_EMAIL=http://localhost:3000/api/mailboxes/gmail/callback

# Optional: PubSub Configuration (for email reply tracking)
GOOGLE_CLOUD_PROJECT=                  # Google Cloud Project ID
PUBSUB_SUBSCRIPTION_NAME=              # PubSub subscription name
PUBSUB_TOPIC_NAME=                    # PubSub topic name
PUBSUB_AUDIENCE=                      # PubSub audience URL for webhooks

# Optional: Google Service Account (for PubSub)
GOOGLE_SERVICE_ACCOUNT_EMAIL=         # Google service account email
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=   # Google service account private key
```

> [!IMPORTANT]
>
> - Never commit your `.env` files to version control
> - Use strong, unique values for all secret keys
> - Keep your Google OAuth credentials secure
> - In production, use different values for all credentials and URLs

For a deeper look at how environment variables are loaded across the monorepo, see the [Environment Variables guide](./env-setup-guide.md).

## Database Setup

1. Create and migrate the database:

   ```bash
   # Create a new PostgreSQL database
   database_name = coldjot_dev

   # Run database migrations
   cd packages/database
   npm run db:generate
   npm run db:migrate
   ```

2. Optional: View and manage your data:

   ```bash
   npm run db:studio
   ```

For the full list of database commands (migrations, seeds, reset, test-tier scripts), see the [Database documentation](./database.md).

## Running Locally

1. Start the required services:

   ```bash
   # Start Redis and PostgreSQL if not running
   docker compose up -d
   ```

2. Run the development server:

   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The development server includes:

- Web application (Next.js) on port 3000
- Mail operations service on port 3001
- Background job processing
