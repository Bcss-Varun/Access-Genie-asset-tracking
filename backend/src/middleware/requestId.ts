import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * Stamp every request with an ID and echo it back on the response, so a user
 * reporting "it failed" can quote a string that leads straight to the log line
 * and the audit row for that exact request.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && incoming.length <= 64 ? incoming : randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
};
