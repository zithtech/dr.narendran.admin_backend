import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type AsyncHandlerFn = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Wraps async Express handlers to safely forward rejections to the error handling pipeline.
 */
export function asyncHandler(fn: AsyncHandlerFn): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
