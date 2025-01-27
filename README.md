<a href="https://coldjot.com">
  <img alt="ColdJot - Modern email automation platform for businesses" src="https://app.coldjot.com/images/screenshot/github.png">
</a>

<h3 align="center">ColdJot</h3>

<p align="center">
    The modern email automation platform for managing and streamlining your email operations.
    <br />
    <a href="https://coldjot.com"><strong>Learn more »</strong></a>
    <br />
    <br />
    <a href="#introduction"><strong>Introduction</strong></a> ·
    <a href="#features"><strong>Features</strong></a> ·
    <a href="#screenshot"><strong>Screenshot</strong></a> ·
    <a href="#tech-stack"><strong>Tech Stack</strong></a> ·
    <a href="#self-hosting"><strong>Self-hosting</strong></a> ·
    <a href="#contributing"><strong>Contributing</strong></a>
</p>

<p align="center">
  <a href="https://github.com/dropocol/coldjot/blob/main/LICENSE.md">
    <img src="https://img.shields.io/badge/license-AGPL--v3-orange" alt="License" />
  </a>
</p>

<br/>

## Introduction

ColdJot is a powerful email automation platform designed to help businesses manage and streamline their email operations. With a focus on productivity and efficiency, ColdJot provides advanced email management capabilities, real-time processing, and a modern web interface.

## Features

- **Advanced Email Operations**

  - Queue-based email processing
  - Email tracking and analytics
  - Template management
  - Automated sequences
  - Contact management

- **Real-time Processing**

  - Efficient queue-based operations
  - Rate limiting and cooldown management
  - System health monitoring
  - Performance metrics tracking

- **Modern Interface**

  - Clean and intuitive UI
  - Responsive design
  - Rich text editor

- **Security & Privacy**
  - Secure authentication with Google OAuth
  - Privacy-focused design
  - Data protection measures
  - Role-based access control

## Screenshot

<img alt="ColdJot - Modern email automation platform for businesses" src="https://app.coldjot.com/images/screenshot/app.png">

## Tech Stack

- [Next.js](https://nextjs.org/) – framework
- [TypeScript](https://www.typescriptlang.org/) – language
- [Tailwind](https://tailwindcss.com/) – CSS
- [PostgreSQL](https://www.postgresql.org/) – database
- [Redis](https://redis.io/) – caching & queues
- [BullMQ](https://docs.bullmq.io/) – job processing
- [Auth.js](https://authjs.dev) – authentication
- [Turborepo](https://turbo.build/repo) – monorepo
- [Prisma](https://www.prisma.io/) – ORM

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

## License

ColdJot is open-source under the GNU Affero General Public License Version 3 (AGPLv3) or any later version. You can [find it here](https://github.com/dropocol/coldjot/blob/main/LICENSE.md).
