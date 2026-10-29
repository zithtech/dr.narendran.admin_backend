import { pool } from '@/db/pool.js';
import { NotFoundError } from '@/http/errors.js';

export interface PermissionInput {
  module_slug: string;
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
}

export interface RoleInput {
  name: string;
  description: string;
  permissions: PermissionInput[];
}

export const rbacService = {
  async getModules() {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`SELECT slug, name, description FROM rbac_modules ORDER BY name ASC`);
      return rows;
    } finally {
      client.release();
    }
  },

  async getRoles() {
    const client = await pool.connect();
    try {
      const { rows: roles } = await client.query(`SELECT name, description, is_system_role, created_at FROM rbac_roles ORDER BY created_at ASC`);
      
      const { rows: permissions } = await client.query(`SELECT role_name, module_slug, can_read, can_write, can_delete FROM rbac_role_permissions`);
      
      return roles.map(role => ({
        ...role,
        permissions: permissions.filter(p => p.role_name === role.name)
      }));
    } finally {
      client.release();
    }
  },

  async getRoleByName(name: string) {
    const client = await pool.connect();
    try {
      const { rows: roles } = await client.query(`SELECT name, description, is_system_role FROM rbac_roles WHERE name = $1`, [name]);
      
      // Auto-fallback for SUPER_ADMIN if it hasn't been seeded yet
      if (roles.length === 0) {
        if (name === 'SUPER_ADMIN') {
          const { rows: allModules } = await client.query(`SELECT slug as module_slug FROM rbac_modules`);
          const permissions = allModules.map(m => ({ module_slug: m.module_slug, can_read: true, can_write: true, can_delete: true }));
          return { name: 'SUPER_ADMIN', description: 'Super Admin', is_system_role: true, permissions };
        }
        throw new NotFoundError('Role not found');
      }
      
      const { rows: permissions } = await client.query(`SELECT module_slug, can_read, can_write, can_delete FROM rbac_role_permissions WHERE role_name = $1`, [name]);
      
      return { ...roles[0], permissions };
    } finally {
      client.release();
    }
  },

  async createRole(data: RoleInput) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      await client.query(
        `INSERT INTO rbac_roles (name, description, is_system_role) VALUES ($1, $2, false)`,
        [data.name, data.description]
      );

      for (const p of data.permissions) {
        if (p.can_read || p.can_write || p.can_delete) {
          await client.query(
            `INSERT INTO rbac_role_permissions (role_name, module_slug, can_read, can_write, can_delete) VALUES ($1, $2, $3, $4, $5)`,
            [data.name, p.module_slug, p.can_read, p.can_write, p.can_delete]
          );
        }
      }

      await client.query('COMMIT');
      return this.getRoleByName(data.name);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async updateRole(name: string, data: RoleInput) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update role
      await client.query(
        `UPDATE rbac_roles SET description = $1 WHERE name = $2`,
        [data.description, name]
      );

      // Delete old permissions
      await client.query(`DELETE FROM rbac_role_permissions WHERE role_name = $1`, [name]);

      // Insert new permissions
      for (const p of data.permissions) {
         if (p.can_read || p.can_write || p.can_delete) {
          await client.query(
            `INSERT INTO rbac_role_permissions (role_name, module_slug, can_read, can_write, can_delete) VALUES ($1, $2, $3, $4, $5)`,
            [name, p.module_slug, p.can_read, p.can_write, p.can_delete]
          );
        }
      }

      await client.query('COMMIT');
      return this.getRoleByName(name);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async deleteRole(name: string) {
    const client = await pool.connect();
    try {
      const res = await client.query(`DELETE FROM rbac_roles WHERE name = $1 RETURNING name`, [name]);
      if (res.rowCount === 0) throw new Error('Role not found');
      return true;
    } finally {
      client.release();
    }
  }
};
