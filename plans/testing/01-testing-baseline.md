# Testing Baseline — Establish Automated Test Coverage

> **Severity:** 🟢 LOW (but high leverage — every other plan is safer to do with tests in place)
> **Effort:** Large (ongoing; ~2 days for the initial scaffolding, then incremental)
> **Depends on:** Ideally lands after `plans/refactor-plan/01–05` so the security fixes are testable. Do the scaffolding first regardless.
>
> **Origin:** Moved here from `plans/refactor-plan/12-testing-strategy.md` so testing has its own dedicated plan area. Sub-plans for additional testing work (e2e, CI hardening, coverage targets) will live alongside this one in `plans/testing/`.

---

## Problem

The codebase has **essentially no automated tests**:

- `apps/mailops/package.json` has `"test": "jest"` and lists `jest`, `sinon`, `@types/sinon` as devDependencies — but there's no `jest.config.*` visible and no `__tests__` directories in the earlier structure scan. The script likely runs zero tests.
- `apps/web` has no test runner configured at all (no jest/vitest in `package.json`).
- No CI pipeline is visible in the repo (no `.github/workflows/` directory was listed in the root scan).
- `packages/types` and `packages/database` have no tests.

Every refactor in the security/quality plans is therefore being done **blind** — you can't confirm you didn't break something without manual clicking. This is especially dangerous for the security changes (IDOR fixes, auth middleware) where a regression silently reintroduces a vulnerability.

---

## Goal

1. A working test runner in each app/package, wired into `turbo run test`.
2. A **CI pipeline** that runs lint + typecheck + tests on every PR.
3. **Security regression tests** for the fixes in `plans/refactor-plan/01`, `03`, `05` (these are the highest-value tests to write first).
4. Unit-test coverage for the shared utilities introduced by the other plans (`crypto`, `parseBody`, `requireAuth`, redaction helpers).
5. A small set of **smoke/e2e tests** covering the critical user flow: connect mailbox → create sequence → add contact → launch → email sends → tracking records.
6. A documented testing convention so new code comes with tests.

This plan deliberately targets a **baseline**, not full coverage. Get the scaffolding green and the critical paths covered; expand from there.

---

## Implementation steps

### Step 1 — Choose the runners

| Layer | Tool | Why |
|---|---|---|
| Web unit/component | **Vitest** + **React Testing Library** | Vitest is jest-compatible, faster, and works natively with ESM/Next.js. RTL is the React standard. |
| Mailops unit | **Vitest** (replace the stub jest config) | Consistency with web; one mental model. |
| API integration | **Vitest** with a test database | Spin up a dedicated Postgres (docker-compose service or testcontainers), run migrations, hit routes in-process. |
| E2E | **Playwright** | Best-in-class for Next.js; covers the critical flow end-to-end. |

> If the team strongly prefers jest for mailops (since it's already a dependency), keep jest there — but vitest is recommended for new code.

### Step 2 — Scaffold Vitest in web

```bash
# from apps/web
npm i -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Create `apps/web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

`apps/web/vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

Add to `apps/web/package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

### Step 3 — Scaffold Vitest in mailops

Similar config (no jsdom — use `node` environment). Replace the jest script.

### Step 4 — Wire into turbo

In root `turbo.json`:
```json
"test": {
  "dependsOn": ["^build:dev"],
  "outputs": []
}
```
And root `package.json`:
```json
"test": "turbo run test"
```

### Step 5 — Set up a test database strategy

For integration tests that touch Prisma, use a **dedicated test database**:
- Add a `postgres_test` service to `docker-compose.yml` (or reuse `postgres` with a separate `DATABASE_URL_TEST`).
- In tests, point `DATABASE_URL` at the test DB, run `prisma migrate reset --force` before the suite, and truncate between tests.
- Consider `testcontainers` for ephemeral Postgres if you want zero-setup CI.

Provide a helper `packages/database/src/test-db.ts` that exports a `prisma` client pointed at the test DB and a `resetDb()` function.

### Step 6 — Write the security regression tests (highest priority)

These directly verify the fixes in `plans/refactor-plan/01`, `03`, `05`. Each is a small, fast test.

**IDOR tests (plan 01):**
```ts
// apps/web/src/app/api/lists/[id]/contacts/route.test.ts
describe("POST /api/lists/:id/contacts", () => {
  it("403s when adding another user's contact to my list", async () => {
    const userA = await createUser();
    const userB = await createUser();
    const contactA = await createContact(userA.id, { email: "a@x.com" });
    const listB = await createList(userB.id);

    const res = await app.request(`/api/lists/${listB.id}/contacts`, {
      method: "POST",
      headers: authHeaders(userB),
      body: JSON.stringify({ contactId: contactA.id }),
    });
    expect(res.status).toBe(403); // or 404
  });
});
```
Write one per IDOR from plan 01 (lists PATCH, lists contacts POST/PUT/DELETE, sequence contacts POST, step mass-assignment).

**Service-auth test (plan 03):**
```ts
describe("mailops internal routes", () => {
  it("401s without X-Service-Token", async () => {
    const res = await mailops.request("/api/sequence/launch", { method: "POST", body: {...} });
    expect(res.status).toBe(401);
  });
  it("404s when acting on another user's sequence even with a valid token", async () => {...});
});
```

**Tracking test (plan 05):**
```ts
describe("email tracking", () => {
  it("records an OPENED event for a valid emailId", async () => {...});
  it("400s for an invalid eventType", async () => {...});
  it("429s after the rate limit", async () => {...});
});
```

### Step 7 — Write unit tests for the shared utilities

These are pure functions — fast and high-value:
- `apps/web/src/lib/crypto.ts` — `encrypt`/`decrypt` round-trip, wrong-key rejection, legacy-plaintext passthrough (plan 02b).
- `apps/web/src/lib/http/validation.ts` — `parseBody` returns 400 on invalid JSON / schema failure (plan 04).
- `apps/web/src/lib/auth/access.ts` — `requireAuth` returns 401 without session (plan 01).
- The redaction helper (plan 09) — confirm known-sensitive keys are replaced.
- zod schemas in `packages/types/src/schemas/` (plan 04) — valid/invalid cases.

### Step 8 — Add a smoke E2E test (Playwright)

Install:
```bash
# from apps/web
npm i -D @playwright/test
npx playwright install
```

Write **one** test covering the happy path:
```ts
// apps/web/e2e/critical-flow.spec.ts
test("connect mailbox → create sequence → launch", async ({ page }) => {
  await page.goto("/login");
  // ... login as a seeded test user
  // ... navigate to sequences, create one, add a contact, launch
  // ... assert the sequence status changes
});
```

This single test catches regressions across auth, DB, and mailops integration. Expand later.

### Step 9 — Set up CI

Create `.github/workflows/ci.yml`:
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: coldjot_test }
        ports: ["5432:5432"]
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm run lint
      - run: npm run build:dev
      - run: npm run test
      - run: npx playwright test  # optional, separate job
```

Wire `DATABASE_URL` and the required secrets via GitHub Actions secrets (never commit them).

### Step 10 — Document the convention

Add `docs/testing.md`:
- How to run tests (`npm test`, `npm run test:watch`).
- When to write tests (every new route/utility — security tests are mandatory for auth-touching code).
- How to add a test database / reset state.
- Where E2E tests live and how to run them locally.

Add a line to `.cursorrules` or `CONTRIBUTING.md`: "Every new API route or server action must include tests for the auth and validation paths."

---

## Files to touch

**Create:**
- `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts`
- `apps/mailops/vitest.config.ts`
- `.github/workflows/ci.yml`
- `apps/web/src/**/*.test.ts(x)` (security + utility tests)
- `apps/mailops/src/**/*.test.ts`
- `apps/web/e2e/critical-flow.spec.ts`
- `packages/database/src/test-db.ts`
- `docs/testing.md`

**Modify:**
- `apps/web/package.json` (test scripts + devDeps)
- `apps/mailops/package.json` (replace jest with vitest, or configure jest properly)
- `turbo.json` (add `test` task)
- Root `package.json` (`"test": "turbo run test"`)
- `docker-compose.yml` (optional test Postgres service)

---

## Verification

- `npm test` from the root runs tests in all packages via turbo and exits 0.
- `npm run lint && npm run build:dev && npm test` all pass locally.
- The CI workflow runs on a PR and is green.
- Deliberately reintroduce an IDOR (revert one plan-01 fix) → the corresponding security test fails. This confirms the test actually catches the regression.
- Playwright smoke test passes against a running dev environment.

---

## Risks & rollback

- **Test database setup is the fiddliest part.** If testcontainers or the CI service wiring is painful, start with mocks for unit tests and add the integration DB later.
- **Playwright in CI is slow and flaky** if the app takes time to boot. Use `webServer` config in `playwright.config.ts` to start the dev server, and consider running E2E as a separate (non-blocking) job initially.
- **Mailops integration tests** require Redis + Postgres + the service running — scope these carefully; prefer unit tests for the controller logic and reserve full integration for the E2E flow.
- **Coverage chasing is a trap.** Target the critical paths (auth, validation, security, crypto, email send) — not 100% line coverage.
- **Rollback:** tests are additive; removing the runner reverts. CI workflow can be disabled without affecting the app.
