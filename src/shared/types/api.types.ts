export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
  search?: string | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'ASC' | 'DESC' | undefined;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
