import type { Request, Response, NextFunction } from "express";
import { toApiError } from "../lib/errors";

/**
 * Last middleware in the chain. Logs the real error server-side (safe
 * metadata only — see requestLogger's comment on what never gets logged)
 * and returns the structured, secret-free error body to the client.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
): void {
  const { status, body } = toApiError(err);
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        method: req.method,
        path: req.path,
        status,
        error: err instanceof Error ? err.message : "non-Error thrown",
      }),
    );
  }
  res.status(status).json(body);
}

/** Wraps an async route handler so rejected promises reach errorHandler. */
export function asyncHandler<
  Req extends Request = Request,
  Res extends Response = Response,
>(fn: (req: Req, res: Res, next: NextFunction) => Promise<void>) {
  return (req: Req, res: Res, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
