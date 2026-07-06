/**
 * Barrel for the test fakes + stubs.
 *
 * mailops v2: the per-repo fakes are gone (the repository layer was deleted —
 * the Prisma `$extends` extension methods + a real Postgres-backed `prisma`
 * singleton replace them in tests). What remains:
 *   - `FakeMailTransport` / `FakeInboxSource` — fake the Gmail adapters.
 *   - `FakeJobManager` / `FakeRateLimitService` — call-recording stubs for the
 *     infra collaborators.
 *   - `FakeBase` / `genId` (from `base.ts`) — still used by `mail-transport.fake`.
 */
export { FakeBase, genId } from "./base";

export { FakeMailTransport, FakeInboxSource } from "./mail-transport.fake";
export { FakeJobManager, FakeRateLimitService } from "./stubs";
