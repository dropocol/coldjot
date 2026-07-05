import { Router } from "express";
import * as controller from "@/controllers/mailbox.controller";
import { send } from "@/controllers/utils";

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

export default router;
