/**
 * Common query construction helpers for Admin services.
 */

export function buildSearchClause(
  fields: readonly string[],
  searchTerm: string | undefined,
  startIndex: number,
): { clause: string; param?: string } {
  if (!searchTerm || fields.length === 0) {
    return { clause: '' };
  }
  const formattedSearch = `%${searchTerm}%`;
  const conditions = fields.map(field => `${field} ILIKE $${startIndex}`);
  return {
    clause: `(${conditions.join(' OR ')})`,
    param: formattedSearch,
  };
}

export function buildPaginationClause(startIndex: number): {
  clause: string;
  limitParamIndex: number;
  offsetParamIndex: number;
} {
  return {
    clause: `LIMIT $${startIndex} OFFSET $${startIndex + 1}`,
    limitParamIndex: startIndex,
    offsetParamIndex: startIndex + 1,
  };
}
