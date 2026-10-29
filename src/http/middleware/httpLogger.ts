import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export function httpLogger(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.headers['x-request-id'];
  const id =
    typeof inbound === 'string' && inbound.length > 0 && inbound.length <= 200
      ? inbound
      : randomUUID();

  (req as any).id = id;
  res.setHeader('x-request-id', id);
  next();
}
