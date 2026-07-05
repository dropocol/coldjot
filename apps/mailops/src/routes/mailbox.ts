import { Router } from "express";
import { send } from "@/controllers/utils";
import type { createMailboxController } from "@/controllers/mailbox.controller";

type MailboxController = ReturnType<typeof createMailboxController>;

/** Phase 6.4: route factory takes the controller. */
export function makeMailboxRouter(controller: MailboxController): Router {
  const router = Router();

  router.post("/watch", async (req, res) => {
    const result = await controller.setupWatch(req.body);
    return send(res, result);
  });

  router.delete("/watch/:email", async (req, res) => {
    const email = decodeURIComponent(String(req.params.email));
    const result = await controller.stopWatch(email);
    return send(res, result);
  });

  return router;
}
