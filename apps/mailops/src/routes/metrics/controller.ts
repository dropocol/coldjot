import { Request, Response } from "express";
import { ServiceManager } from "@/services/service-manager";
import { MonitoringService } from "@/services/monitor/service";
import { logger } from "@/lib/log";

// Initialize services
const serviceManager = ServiceManager.getInstance();
const monitoringService = new MonitoringService(serviceManager);

export async function getSystemMetrics(req: Request, res: Response) {
  try {
    const metrics = await monitoringService.getSystemMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error("Error getting system metrics:", error);
    res.status(500).json({ error: "Failed to get system metrics" });
  }
}

export async function getSequenceHealth(req: Request<{ id: string }>, res: Response) {
  try {
    const { id } = req.params;
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

    res.json(health);
  } catch (error) {
    logger.error("Error getting sequence health:", error);
    res.status(500).json({ error: "Failed to get sequence health" });
  }
}
