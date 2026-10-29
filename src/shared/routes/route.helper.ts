import { Router, type RouterOptions } from 'express';

/**
 * Creates an Express router configured for Admin API modules.
 */
export function createApiRouter(options?: RouterOptions): Router {
  return Router({ mergeParams: true, ...options });
}
