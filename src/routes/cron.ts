import { Router } from "express";
import { cronAuth } from "../middleware/cronAuth";

export const cronRouter = Router();

/**
 * Vercel Cron hits this every 6 hours (vercel.json). Auth is real; the
 * actual scan/scrape pipeline is not — that's Phase 2. Returning a clear
 * "not implemented" body rather than a fake success response so nobody
 * mistakes this for a working scheduler.
 */
cronRouter.all("/", cronAuth, (_req, res) => {
  res.status(200).json({
    status: "no_op",
    message:
      "Cron authentication is live, but the scraping/monitoring pipeline is not implemented yet (planned for Phase 2).",
  });
});
