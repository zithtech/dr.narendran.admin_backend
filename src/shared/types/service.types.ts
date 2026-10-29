import type { PoolClient } from 'pg';

export type TransactionCallback<T> = (client: PoolClient) => Promise<T>;

export interface BaseFindOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  search?: string;
}

export interface CrudOperations<T, CreateInput, UpdateInput> {
  getAll?(options?: BaseFindOptions): Promise<T[] | { items: T[]; total: number }>;
  getById?(id: string): Promise<T | null>;
  create?(input: CreateInput): Promise<T>;
  update?(id: string, input: UpdateInput): Promise<T | null>;
  delete?(id: string): Promise<boolean>;
}
