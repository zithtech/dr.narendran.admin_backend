export {
  requireAuth,
  requireRole,
  requireSelfOrRole,
} from '@/http/middleware/authenticate.js';
export {
  requirePermission,
  requirePermissionOrPatient,
} from '@/http/middleware/rbac.middleware.js';
export {
  apiRateLimiter,
  loginRateLimiter,
} from '@/http/middleware/rateLimit.js';
export {
  handler,
  type RequestSchemas,
  validate,
  type ValidatedData,
} from '@/http/middleware/validate.js';
