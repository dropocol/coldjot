# Database Commands

This document outlines the available database commands and their usage in different environments.

> **Scope note:** Commands marked **root** can be run from the repository root. Commands marked **package** must be run from `packages/database/`. Most root commands proxy into the `@coldjot/database` workspace via Turbo.

## Environment Setup

The database package uses environment-specific configuration files located in `packages/database/env/`:

```
packages/database/env/
├── .env.development    # Development environment
└── .env.production     # Production environment
```

## Available Commands

### Development Commands

These commands are for local development only:

```bash
# Create and apply a new migration (interactive)              [package or root]
npm run db:migrate

# Create a migration without applying it                       [package only]
npm run db:migrate:create

# Apply migrations (non-interactive)                           [package or root]
npm run db:deploy

# Push schema changes without migrations                       [package or root]
npm run db:push

# Seed the database                                            [package or root]
npm run db:seed

# Reset the database (drops all data)                          [package or root]
npm run db:reset

# Open Prisma Studio                                           [package or root]
npm run db:studio

# Generate Prisma Client                                       [package or root]
npm run db:generate
```

> [!NOTE]
> `db:migrate`, `db:push`, `db:reset`, and `db:studio` are destructive/interactive and should only be used in development.

### Test Database Commands

These commands manage a separate `coldjot_test` database used by the test suite. Run them from `packages/database/`:

```bash
# Create the coldjot_test database                              [package only]
npm run db:test:create

# Apply migrations to the test database                         [package only]
npm run db:test:deploy

# Create + migrate the test database in one step                [package or root]
npm run db:test:setup
```

The test commands read from `DATABASE_URL_TEST` (set in `packages/database/env/.env`).

### Production Commands

Safe commands for production. These read from `packages/database/env/.env.production`:

```bash
# Deploy migrations to production                              [package or root]
npm run db:deploy:prod

# Seed production database                                      [package only]
npm run db:seed:prod
```

> [!WARNING]
> Never use `db:push`, `db:migrate`, or `db:reset` in production. Always use `db:deploy:prod`.

## Command Details

### Migration Commands

- `db:migrate` — Creates and applies migrations interactively (development only)
- `db:migrate:create` — Creates migration files without applying them
- `db:deploy` — Applies pending migrations safely (non-interactive)
- `db:deploy:prod` — Applies migrations to production

### Database Management

- `db:push` — Quick schema push without migrations (development only)
- `db:seed` — Seeds the database with initial data
- `db:reset` — Resets the database (development only)
- `db:studio` — Opens Prisma Studio for database visualization

### Utility Commands

- `db:generate` — Generates Prisma Client

## Best Practices

1. **Development Workflow**:

   - Use `db:migrate` for schema changes during development
   - Use `db:push` for quick iterations without migrations
   - Use `db:studio` to visualize and modify data

2. **Production Workflow**:

   - Always use `db:deploy:prod`
   - Never use `db:push` or `db:migrate` in production
   - Test migrations in development first

3. **Migration Safety**:

   - Always review migrations before applying them
   - Use `db:migrate:create` to review changes before applying
   - Test migrations in development first

## Environment Variables

Each command requires specific environment variables:

- `DATABASE_URL` — Required for all commands
- `DATABASE_URL_TEST` — Required for the `db:test:*` commands

These are automatically loaded from the appropriate `.env` file based on the command. See the [Environment Variables guide](./env-setup-guide.md) for how env files are loaded across the monorepo.
