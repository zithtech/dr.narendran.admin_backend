import type { Request } from 'express';

import type { PaginationParams } from '../types/api.types.js';

/**
 * Standard parameter and query extractors for Admin controllers.
 */

export function getParamId(req: Request, paramName = 'id'): string {
  const value = req.params[paramName];
  if (!value || typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

export function getPaginationQuery(req: Request, defaultLimit = 20): PaginationParams {
  const rawPage = parseInt(String(req.query['page'] || '1'), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawLimit = parseInt(String(req.query['limit'] || String(defaultLimit)), 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : defaultLimit;

  const offset = (page - 1) * limit;

  const rawSearch = req.query['search'];
  const search = typeof rawSearch === 'string' && rawSearch.trim().length > 0
    ? rawSearch.trim()
    : undefined;

  const rawSortBy = req.query['sortBy'];
  const sortBy = typeof rawSortBy === 'string' && rawSortBy.trim().length > 0
    ? rawSortBy.trim()
    : undefined;

  const rawSortOrder = String(req.query['sortOrder'] || 'DESC').toUpperCase();
  const sortOrder: 'ASC' | 'DESC' = rawSortOrder === 'ASC' ? 'ASC' : 'DESC';

  return {
    page,
    limit,
    offset,
    search,
    sortBy,
    sortOrder,
  };
}
