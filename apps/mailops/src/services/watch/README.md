# Gmail Watch Services

This directory contains services for managing Gmail API watch operations, which enable real-time notifications for email changes.

## Core Services

- **WatchService**: Handles setting up, renewing, and stopping Gmail API watches
- **WatchCleanupService**: Periodically checks for watches that need renewal and processes them

## Development and Debugging

For development and debugging purposes, a separate `WatchDebugService` is available. This service is only loaded in development environments.

### Enabling Development Mode

Development mode can be enabled by:

1. Setting `NODE_ENV=development` (automatically enables development mode)
2. Setting `WATCH_DEV_MODE=true` (explicitly enables development mode)

### Development Settings

Development settings are configured in `config/watch/constants.ts` under the `DEV` object:

```typescript
DEV: {
  // Enable development mode
  ENABLED: process.env.WATCH_DEV_MODE === "true" || process.env.NODE_ENV === "development",

  // How often to run the cleanup service (in minutes)
  CLEANUP_INTERVAL_MINUTES: 1,

  // How soon before expiration to renew watches (in minutes)
  RENEWAL_BUFFER_MINUTES: 5,

  // Default expiration time for testing (in minutes)
  DEFAULT_EXPIRATION_MINUTES: 10,

  // Enable verbose logging
  VERBOSE_LOGGING: true,
}
```

### Using Debug Utilities

The debug utilities are available in development mode through the `WatchDebugService`:

```typescript
import { WatchDebugService } from "../services/watch";

// Create a debug service instance
const watchDebugService = new WatchDebugService();

// Example 1: Set a watch to expire soon and let the automatic process handle it
await watchDebugService.setWatchNearExpirationByEmail(
  "your.email@example.com",
  3
);
// The next cleanup cycle will detect this watch needs renewal

// Example 2: Force immediate renewal
await watchDebugService.forceRenewWatchByEmail("your.email@example.com");

// Example 3: Manually trigger a cleanup cycle
await watchDebugService.manualCleanup();

// Example 4: Run a comprehensive test of the renewal process
const testResult = await watchDebugService.testWatchRenewalProcess(
  "your.email@example.com"
);
console.log(JSON.stringify(testResult, null, 2));
```

### Troubleshooting Watch Renewal Issues

If watches are not being renewed properly, you can use the debug utilities to:

1. Check if the cleanup service is running with the correct interval
2. Verify that watches are being detected for renewal
3. Test the renewal process with a specific watch
4. Force renewal of a watch to see if there are any errors

The `testWatchRenewalProcess` method provides a comprehensive test that:

- Sets a watch to expire soon
- Runs a cleanup cycle
- Verifies if the watch was successfully renewed
- Returns detailed information about the test results
