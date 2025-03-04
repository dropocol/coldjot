<h1 align="left">ColdJot</h3>
<a href="https://coldjot.com">
  <img alt="ColdJot - Modern email automation platform for businesses" src="https://app.coldjot.com/images/screenshot/github.png">
</a>

<!-- [![Deploy with Vercel](https://vercel.com/button)](https://coldjot.com) -->

The modern email automation platform for managing and streamlining your email operations.

## Table of Contents

- [What is ColdJot?](#what-is-coldjot)
- [Why ColdJot?](#why-coldjot)
- [Our Mission](#our-mission)
- [Features](#features)
  - [Email Sequences](#email-sequences)
  - [Analytics Dashboard](#analytics-dashboard)
  - [Contact Management](#contact-management)
  - [Email Templates](#email-templates)
  - [Multiple Mailbox Support](#multiple-mailbox-support)
  - [Gmail Integration](#gmail-integration)
  - [Timeline View](#timeline-view)
  - [Security & Privacy](#security--privacy)
- [Open Source Commitment](#open-source-commitment)
- [Development Status](#development-status)
- [Screenshot](#screenshot)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Running Locally](#running-locally)
- [Self-Hosting](#self-hosting)
  - [Prerequisites](#prerequisites-1)
  - [Installation](#installation)
- [Contributing](#contributing)
- [Issues](#issues)
  - [Create a new issue](#create-a-new-issue)
  - [Solve an issue](#solve-an-issue)
- [Pull Request](#pull-request)
- [License](#license)

## What is ColdJot?

ColdJot is a powerful email automation platform designed to help businesses manage and streamline their email operations. With a focus on productivity and efficiency, ColdJot provides advanced email management capabilities, real-time processing, and a modern web interface.

## Why ColdJot?

Most email automation tools today are either **overly complex**, **expensive**, or **lack modern features**. ColdJot is different:

✅ **Powerful Automation** – Streamline your email workflows with advanced automation capabilities.  
🔒 **Efficient Processing** – Queue-based operations ensure reliable delivery and performance.  
⚙️ **Modern Interface** – Clean, intuitive UI that makes email management a breeze.  
📊 **Comprehensive Analytics** – Track and analyze your email performance with detailed insights.  
🎨 **Customizable Templates** – Create and manage email templates that reflect your brand.  
🤖 **AI Features** – Coming soon! Leverage artificial intelligence to enhance email personalization and optimize send times.

## Our Mission

We believe email automation should be:

1. **Efficient** – Save time and resources with streamlined workflows.
2. **Powerful** – Provide advanced capabilities for complex email operations.
3. **User-Friendly** – Intuitive interface that doesn't require technical expertise.
4. **Reliable** – Ensure consistent delivery and performance.

## Features

### Email Sequences

Create and manage sophisticated email sequences with ease. Schedule, automate, and track your email campaigns effortlessly.

- Multi-step sequence automation
- Flexible timing and scheduling
- Conditional logic for personalized follow-ups

### Analytics Dashboard

Get detailed insights into your email campaigns with comprehensive analytics:

- Open and click tracking
- Response rate monitoring
- Sequence performance metrics
- Engagement analytics

### Contact Management

Import, organize, and manage your contacts efficiently:

- Contact list segmentation
- Import functionality
- Activity history tracking

### Email Templates

Create and save reusable email templates to maintain consistency and save time:

- Rich text editor
- Make changes in one location, and it will automatically reflect everywhere.
- Coming soon! Enhance your email campaigns with dynamic content that personalizes each message for your audience.

### Multiple Mailbox Support

Manage all your email accounts from a single platform:

- Connect unlimited email accounts
- Centralized management interface
- Separate sending quotas for each mailbox
- Mailbox-specific settings and configurations
- Distribute campaigns across multiple mailboxes for higher deliverability

### Gmail Integration

Connect and manage multiple Gmail mailboxes:

- Send emails from your preferred Gmail account
- Reply tracking
- Quota management
- Automatic rate limiting to respect Gmail's sending limits
- OAuth-based secure authentication

### Security & Privacy

- Secure authentication with Google OAuth
- Privacy-focused design
- Data protection measures

## Open Source Commitment

**ColdJot is and will always remain open source.** We believe in the power of community-driven software and are committed to maintaining ColdJot as a free and open platform.

### Our Open Source Promise:

- **Forever Free**: The core ColdJot platform will always be available as open source software
- **No Vendor Lock-in**: You own your data and can self-host without restrictions
- **Transparent Development**: Our development process is open and community-driven
- **MIT License**: Freedom to use, modify, and distribute the software for any purpose

While we may offer premium hosted services in the future, the core platform will remain open source, ensuring you always have the freedom to run ColdJot on your own terms.

## Development Status

🚧 **ColdJot is currently under active development** 🚧

As an evolving platform, ColdJot is in its early stages and may contain bugs or incomplete features. We're working diligently to improve it every day, but we need your help to make it even better!

### Join the Movement

We believe in the power of community-driven development. If you're a developer, designer, or email enthusiast:

- **Try it out** – Test the platform and provide feedback
- **Report bugs** – Help us identify and fix issues
- **Suggest features** – Share your ideas for improvements
- **Contribute code** – Join our growing community of contributors

Your input is invaluable in shaping ColdJot into an awesome platform that truly serves the needs of its users. Together, we can build something remarkable!

## Screenshot

<img alt="ColdJot - Modern email automation platform for businesses" src="https://app.coldjot.com/images/screenshot/app.png">

## Tech Stack

ColdJot is built with modern and reliable technologies:

- [Next.js](https://nextjs.org/) – framework
- [TypeScript](https://www.typescriptlang.org/) – language
- [Tailwind](https://tailwindcss.com/) – CSS
- [PostgreSQL](https://www.postgresql.org/) – database
- [Redis](https://redis.io/) – caching & queues
- [BullMQ](https://docs.bullmq.io/) – job processing
- [Auth.js](https://authjs.dev) – authentication
- [Turborepo](https://turbo.build/repo) – monorepo
- [Prisma](https://www.prisma.io/) – ORM

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL
- Redis

### Environment Variables

Copy the example env files and configure the necessary variables:

```bash
# Copy example env files
cp apps/web/env/.env.example apps/web/env/.env
cp apps/mailops/env/.env.example apps/mailops/env/.env
cp apps/packages/env/.env.example apps/packages/env/.env
```

Configure the following essential variables:

```
# Auth
GOOGLE_CLIENT_ID=       # Required for Google OAuth
GOOGLE_CLIENT_SECRET=   # Required for Google OAuth

# Database
DATABASE_URL=           # PostgreSQL connection string

# Redis
REDIS_URL=              # Redis connection string
```

### Running Locally

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Self-Hosting

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL
- Redis

### Installation

1. Clone the repository:

```bash
git clone https://github.com/dropocol/coldjot.git
cd coldjot
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

   - Copy the example env files in `apps/web/env/`, `apps/mailops/env/` and `apps/packages/env/`
   - Configure the necessary environment variables

4. Start the development server:

```bash
npm run dev
```

## Contributing

We love our contributors! Here's how you can contribute:

- [Open an issue](https://github.com/dropocol/coldjot/issues) if you believe you've encountered a bug.
- Make a [pull request](https://github.com/dropocol/coldjot/pull) to add new features/make quality-of-life improvements/fix bugs.

## Issues

### Create a new issue

If you spot a problem with the docs, search if an issue already exists. If a related issue doesn't exist, you can open a new issue using a relevant issue form.

### Solve an issue

Scan through our existing issues to find one that interests you. You can narrow down the search using `labels` as filters. As a general rule, we don't assign issues to anyone. If you find an issue to work on, you are welcome to open a PR with a fix.

## Pull Request

When you're finished with the changes, create a pull request, also known as a PR.

- Fill the "Ready for review" template so that we can review your PR. This template helps reviewers understand your changes as well as the purpose of your pull request.
- Don't forget to link PR to issue if you are solving one.
- Enable the checkbox to allow maintainer edits so the branch can be updated for a merge. Once you submit your PR, a reviewer will review your proposal. We may ask questions or request additional information.
- We may ask for changes to be made before a PR can be merged, either using suggested changes or pull request comments. You can apply suggested changes directly through the UI. You can make any other changes in your fork and then commit them to your branch.
- As you update your PR and apply changes, mark each conversation as resolved.
- If you run into any merge issues, check out this git tutorial to help you resolve merge conflicts and other issues.

## License

ColdJot is open-source under the GNU Affero General Public License Version 3 (AGPLv3) or any later version. You can [find it here](https://github.com/dropocol/coldjot/blob/main/LICENSE.md).

---

🤍 **ColdJot – Email Automation, Reimagined.**
