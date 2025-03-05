# ColdJot Web Application

This is the web application for ColdJot, built with Next.js and running in a Turborepo monorepo setup.

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org)
- **Language**: [TypeScript](https://www.typescriptlang.org)
- **Styling**: [Tailwind CSS](https://tailwindcss.com)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com)
- **Authentication**: [NextAuth.js](https://next-auth.js.org)

## Prerequisites

Before you begin, ensure you have installed:

- Node.js 20 or higher
- npm or yarn
- PostgreSQL (for database)

## Development Setup

1. **Install Dependencies**

   ```bash
   # From the root of the monorepo
   npm install
   ```

2. **Environment Variables**

   ```bash
   # Copy the example env file
   cp env/.env.example env/.env
   ```

   Required variables:

   ```env
   # App
   APP_ENV=development
   NODE_ENV=development

   # Auth (Required for Google OAuth)
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret

   # Database
   DATABASE_URL=postgresql://username:password@localhost:5432/coldjot_dev

   # Redis
   REDIS_URL=redis://localhost:6379

   # Next Auth
   NEXTAUTH_SECRET=your_random_secret_key
   NEXTAUTH_URL=http://localhost:3000
   ```

3. **Database Setup**
   ```bash
   # From the root of the monorepo
   npm run db:deploy
   ```

## Running the Application

### Development Mode

```bash
# Start the development server with Turbopack
npm run dev

# The web app will be available at http://localhost:3000
```

### Production Build

```bash
# Create a production build
npm run build:prod

# Start the production server
npm run start:prod
```

## Available Scripts

- `dev` - Start development server with Turbopack
- `build` - Build for development
- `build:dev` - Build for development environment
- `build:prod` - Build for production environment
- `start` - Start the server in development mode
- `start:prod` - Start the server in production mode
- `lint` - Run ESLint
- `clean` - Clean build artifacts and dependencies

## Turborepo Configuration

The web app is part of a Turborepo monorepo setup. Key configurations:

- **Cache**: Development server runs with cache disabled
- **Environment Variables**: Configured in `turbo.json`
- **Build Pipeline**: Depends on other workspace packages
- **Development Flow**: Uses Turbopack for faster development experience

## Project Structure

```
apps/web/
├── env/                # Environment configuration
├── public/            # Static assets
├── src/
│   ├── app/          # Next.js app directory
│   ├── components/   # React components
│   ├── lib/         # Utility functions
│   └── styles/      # Global styles
├── next.config.ts    # Next.js configuration
├── tailwind.config.ts # Tailwind CSS configuration
└── tsconfig.json    # TypeScript configuration
```

## Development Guidelines

1. **Code Style**

   - Follow TypeScript best practices
   - Use functional components with hooks
   - Implement proper error boundaries
   - Follow the established project structure

2. **State Management**

   - Use React Query for server state
   - Keep local state minimal
   - Implement proper loading states

3. **Performance**

   - Use proper code splitting
   - Implement proper caching strategies
   - Optimize images and assets

4. **Accessibility**
   - Follow WCAG guidelines
   - Use semantic HTML
   - Implement proper ARIA attributes

## Troubleshooting

Common issues and solutions:

1. **Build Errors**

   ```bash
   # Clear Turbo cache
   npm run clean

   # Reinstall dependencies
   npm install
   ```

2. **Development Server Issues**

   - Ensure all required services (Redis, PostgreSQL) are running
   - Verify environment variables are set correctly
   - Check port 3000 is available

3. **Database Connection Issues**
   - Verify PostgreSQL is running
   - Check DATABASE_URL is correct
   - Ensure database exists and is accessible

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
