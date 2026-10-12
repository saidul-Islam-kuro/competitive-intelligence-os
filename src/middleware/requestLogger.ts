import type { Request, Response, NextFunction } from "express";

/**
 * Deliberately minimal: method, path, status, duration. Never logs headers,
 * bodies, query strings, or auth material — per 04_DEVELOPMENT_RULES #15,
 * logs must never include API keys, cookies, or Authorization headers.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      }),
    );
  });
  next();
}
