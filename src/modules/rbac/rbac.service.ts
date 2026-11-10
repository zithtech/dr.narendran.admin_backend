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
      
      const roleList = roles.map(role => ({
        ...role,
        permissions: permissions.filter(p => p.role_name.toLowerCase() === role.name.toLowerCase())
      }));

      // Ensure default system roles appear if not in database
      const existingNames = new Set(roleList.map(r => r.name.toUpperCase()));
      if (!existingNames.has('SUPER_ADMIN') && !existingNames.has('ADMIN')) {
        roleList.unshift({
          name: 'ADMIN',
          description: 'Full access to clinical settings, staff, hospitals, and analytics.',
          is_system_role: true,
          created_at: new Date(),
          permissions: [],
        });
      }
      if (!existingNames.has('DOCTOR')) {
        roleList.push({
          name: 'DOCTOR',
          description: 'Access to appointment queues, patient consults, and e-prescriptions.',
          is_system_role: false,
          created_at: new Date(),
          permissions: [
            { role_name: 'DOCTOR', module_slug: 'DOCTORS', can_read: true, can_write: true, can_delete: true },
            { role_name: 'DOCTOR', module_slug: 'PATIENTS', can_read: true, can_write: true, can_delete: true },
            { role_name: 'DOCTOR', module_slug: 'PRESCRIPTIONS', can_read: true, can_write: true, can_delete: true },
            { role_name: 'DOCTOR', module_slug: 'SUPPORT', can_read: true, can_write: true, can_delete: true },
          ],
        });
      }

      return roleList;
    } finally {
      client.release();
    }
  },

  async getRoleByName(name: string) {
    const client = await pool.connect();
    try {
      const cleanName = (name || '').trim();
      const { rows: roles } = await client.query(
        `SELECT name, description, is_system_role FROM rbac_roles WHERE LOWER(name) = LOWER($1)`,
        [cleanName]
      );
      
      // Auto-fallback for system and standard roles if not in custom table
      if (roles.length === 0) {
        const upper = cleanName.toUpperCase();
        if (
          upper === 'SUPER_ADMIN' ||
          upper === 'ADMIN' ||
          upper === 'SUPER ADMIN' ||
          upper === 'ADMINISTRATOR' ||
          upper === 'SYSTEM ADMINISTRATOR'
        ) {
          const { rows: allModules } = await client.query(`SELECT slug as module_slug FROM rbac_modules`);
          const permissions = allModules.map(m => ({
            module_slug: m.module_slug,
            can_read: true,
            can_write: true,
            can_delete: true,
          }));
          return {
            name: cleanName,
            description: 'System Administrator',
            is_system_role: true,
            permissions,
          };
        }
        if (upper === 'DOCTOR') {
          const doctorSlugs = ['DOCTORS', 'PATIENTS', 'PRESCRIPTIONS', 'SUPPORT', 'LABS', 'LAB_SERVICES'];
          const permissions = doctorSlugs.map(slug => ({
            module_slug: slug,
            can_read: true,
            can_write: true,
            can_delete: true,
          }));
          return {
            name: 'DOCTOR',
            description: 'Doctor / Clinician',
            is_system_role: false,
            permissions,
          };
        }
        if (upper === 'PATIENT') {
          const patientSlugs = ['PATIENTS', 'PRESCRIPTIONS', 'SUPPORT'];
          const permissions = patientSlugs.map(slug => ({
            module_slug: slug,
            can_read: true,
            can_write: true,
            can_delete: false,
          }));
          return {
            name: 'PATIENT',
            description: 'Patient',
            is_system_role: false,
            permissions,
          };
        }
        throw new NotFoundError('Role not found');
      }
      
      const { rows: permissions } = await client.query(
        `SELECT module_slug, can_read, can_write, can_delete FROM rbac_role_permissions WHERE LOWER(role_name) = LOWER($1)`,
        [roles[0].name]
      );
      
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
