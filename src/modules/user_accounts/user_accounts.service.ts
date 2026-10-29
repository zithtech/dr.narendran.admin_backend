import * as argon2 from 'argon2';

import {pool} from '@/db/pool.js';

export interface CreateUserAccountInput {
  username: string;
  password?: string | null | undefined;
  role: 'ADMIN' | 'DOCTOR' | 'PATIENT';
  status: 'ACTIVE' | 'INACTIVE';
}

export interface UpdateUserAccountInput {
  id: string;
  username: string;
  password?: string | null | undefined;
  role: 'ADMIN' | 'DOCTOR' | 'PATIENT';
  status: 'ACTIVE' | 'INACTIVE';
}

export class UserAccountsService {
  async getAllUserAccounts() {
    const client = await pool.connect();
    try {
      const {rows} = await client.query(`
        SELECT id, username, role, status, created_at, updated_at 
        FROM user_accounts 
        ORDER BY created_at DESC
      `);
      return rows;
    } finally {
      client.release();
    }
  }

  async getUserAccountById(id: string) {
    const client = await pool.connect();
    try {
      const {rows} = await client.query(
        'SELECT id, username, role, status, created_at, updated_at FROM user_accounts WHERE id = $1',
        [id],
      );
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async createUserAccount(data: CreateUserAccountInput) {
    const client = await pool.connect();
    try {
      const passwordHash = data.password
        ? await argon2.hash(data.password)
        : '';
      const {rows} = await client.query(
        `INSERT INTO user_accounts (username, password_hash, role, status, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id, username, role, status, created_at, updated_at`,
        [data.username, passwordHash, data.role, data.status],
      );
      return rows[0];
    } finally {
      client.release();
    }
  }

  async updateUserAccount(data: UpdateUserAccountInput) {
    const client = await pool.connect();
    try {
      if (data.password) {
        const passwordHash = await argon2.hash(data.password);
        const {rows} = await client.query(
          `UPDATE user_accounts 
           SET username = $1, password_hash = $2, role = $3, status = $4, updated_at = NOW() 
           WHERE id = $5 RETURNING id, username, role, status, created_at, updated_at`,
          [data.username, passwordHash, data.role, data.status, data.id],
        );
        return rows[0] || null;
      } else {
        const {rows} = await client.query(
          `UPDATE user_accounts 
           SET username = $1, role = $2, status = $3, updated_at = NOW() 
           WHERE id = $4 RETURNING id, username, role, status, created_at, updated_at`,
          [data.username, data.role, data.status, data.id],
        );
        return rows[0] || null;
      }
    } finally {
      client.release();
    }
  }

  async deleteUserAccount(id: string) {
    const client = await pool.connect();
    try {
      const {rowCount} = await client.query(
        'DELETE FROM user_accounts WHERE id = $1',
        [id],
      );
      return rowCount !== null && rowCount > 0;
    } finally {
      client.release();
    }
  }
}

export const userAccountsService = new UserAccountsService();
