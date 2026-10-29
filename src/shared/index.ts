/**
 * Shared Common Components for Admin Backend
 *
 * Centralized location for:
 * - controllers: Standardized response helpers, error handlers, query/param extractors, async wrappers
 * - services: DB transaction manager, client lease, SQL query helpers, reference code generator
 * - routes: Standard router creator and route helpers
 * - middleware: Auth guards, RBAC, Zod validation, rate limiting
 * - types: Common API responses, pagination parameters, service operations
 */

export * from './types/index.js';
export * from './controllers/index.js';
export * from './services/index.js';
export * from './routes/index.js';
export * from './middleware/index.js';
