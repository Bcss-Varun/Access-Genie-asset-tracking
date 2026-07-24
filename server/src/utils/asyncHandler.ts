import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wrap an async route handler so a rejected promise reaches the error
 * middleware. Express 5 forwards async rejections on its own, but wrapping
 * keeps the intent explicit at every call site and stays correct if a handler
 * is ever mounted somewhere Express does not (e.g. a custom router).
 */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}
