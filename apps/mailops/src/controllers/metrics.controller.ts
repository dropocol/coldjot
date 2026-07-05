import { ServiceManager } from "@/services/service-manager";
import { MonitoringService } from "@/services/monitor/service";
import { logger } from "@/lib/log";
import { ok, serverError, type ControllerResult } from "./utils";

// Initialize services
const serviceManager = ServiceManager.getInstance();
const monitoringService = new MonitoringService(serviceManager);

export async function getSystemMetrics(): Promise<ControllerResult> {
  try {
    const metrics = await monitoringService.getSystemMetrics();
    return ok(metrics);
  } catch (error) {
    logger.error({ err: error }, "Error getting system metrics");
    return serverError("Failed to get system metrics");
  }
}

export async function getSequenceHealth(
  id: string
): Promise<ControllerResult> {
  try {
    const health = await monitoringService.checkSequenceHealth(id, {
      errorThreshold: 0.1,
      warningThreshold: 0.05,
      criticalThreshold: 0.2,
      checkInterval: 5 * 60 * 1000,
      retryInterval: 60 * 1000,
      maxRetries: 3,
      channels: {
        //TODO: add email alerts
        // email: [process.env.ALERT_EMAIL_TO || ""],
      },
    });

    return ok(health);
  } catch (error) {
    logger.error({ err: error }, "Error getting sequence health");
    return serverError("Failed to get sequence health");
  }
}
