import crypto from 'node:crypto';

/**
 * Standard reference code generator for Admin entities.
 * E.g.: generateReferenceCode('HSP', 3) -> 'HSP-3F8B2C'
 */
export function generateReferenceCode(prefix: string, byteLength = 3): string {
  const randomHex = crypto.randomBytes(byteLength).toString('hex').toUpperCase();
  return `${prefix}-${randomHex}`;
}
