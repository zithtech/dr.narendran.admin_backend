import { pool } from '@/db/pool.js';
import { NotFoundError } from '@/http/errors.js';

export interface PermissionInput {
  module_slug: string;
  can_read: boolean;
  can_write?: boolean | undefined;
  can_create?: boolean | undefined;
  can_update?: boolean | undefined;
  can_delete: boolean;
  can_manage?: boolean | undefined;
}

export interface RoleInput {
  name: string;
  description: string;
  permissions: PermissionInput[];
}

export interface ModuleDefinition {
  slug: string;
  name: string;
  category: string;
  description: string;
}

export const AVAILABLE_MODULES: ModuleDefinition[] = [
  // Facility Management
  {
    slug: 'HOSPITALS',
    name: 'Hospitals',
    category: 'Facility Management',
    description: 'Manage hospitals, medical centers, and main facility profiles',
  },
  {
    slug: 'BRANCHES',
    name: 'Hospital Branches',
    category: 'Facility Management',
    description: 'Manage hospital branch locations, clinics, and contact details',
  },

  // Clinical & Consultations
  {
    slug: 'DOCTORS',
    name: 'Doctors',
    category: 'Clinical & Consultations',
    description: 'Manage doctor profiles, specializations, qualifications, and credentials',
  },
  {
    slug: 'AVAILABILITY',
    name: 'Availability & Slots',
    category: 'Clinical & Consultations',
    description: 'Configure doctor weekly consultation hours and appointment slot duration',
  },
  {
    slug: 'APPOINTMENTS',
    name: 'Appointments',
    category: 'Clinical & Consultations',
    description: 'Schedule, track, manage, reschedule, and cancel patient consultations',
  },
  {
    slug: 'TODAYS_SCHEDULE',
    name: "Today's Schedule",
    category: 'Clinical & Consultations',
    description: 'Live daily queue, token callouts, and doctor consultation tracking',
  },
  {
    slug: 'PATIENTS',
    name: 'Patients',
    category: 'Clinical & Consultations',
    description: 'Manage patient records, demographics, blood group, and registration',
  },
  {
    slug: 'PRESCRIPTIONS',
    name: 'Prescriptions',
    category: 'Clinical & Consultations',
    description: 'Create, view, and print doctor e-prescriptions and clinical records',
  },

  // Pharmacy & Inventory
  {
    slug: 'PHARMACY',
    name: 'Pharmacy',
    category: 'Pharmacy & Inventory',
    description: 'Manage medicines master catalog, generic formulations, brands, and pricing',
  },
  {
    slug: 'INVENTORY',
    name: 'Medicine Inventory',
    category: 'Pharmacy & Inventory',
    description: 'Track medicine stock levels, batch numbers, reorder points, and expiry',
  },
  {
    slug: 'MEDICINE_PACKAGES',
    name: 'Medicine Packages',
    category: 'Pharmacy & Inventory',
    description: 'Create, edit, and group pharmacy medicines into reusable consultation packages',
  },
  {
    slug: 'ORDERS',
    name: 'Pharmacy Orders',
    category: 'Pharmacy & Inventory',
    description: 'Manage patient pharmacy orders, fulfillment status, and order dispatch',
  },

  // Laboratory & Diagnostics
  {
    slug: 'LABS',
    name: 'Linked Labs',
    category: 'Laboratory & Diagnostics',
    description: 'Manage connected diagnostic laboratories, partner centers, and credentials',
  },
  {
    slug: 'LAB_SERVICES',
    name: 'Lab Services',
    category: 'Laboratory & Diagnostics',
    description: 'Manage diagnostic lab test master list, test parameters, sample types, and pricing',
  },
  {
    slug: 'LINKED_MEDICALS',
    name: 'Linked Medicals',
    category: 'Laboratory & Diagnostics',
    description: 'Manage affiliated retail pharmacies, medical stores, and partner locations',
  },

  // Administration & Security
  {
    slug: 'CLIENT_PORTALS',
    name: 'Client Portals',
    category: 'Administration & Security',
    description: 'Manage external lab partner credentials, unique login tokens, and portal access',
  },
  {
    slug: 'USERS',
    name: 'User Accounts',
    category: 'Administration & Security',
    description: 'Manage administrator and staff system login accounts, active status, and passwords',
  },
  {
    slug: 'STAFF',
    name: 'Staff Management',
    category: 'Administration & Security',
    description: 'Manage hospital staff profiles, employee codes, shift timings, and documents',
  },
  {
    slug: 'ROLES',
    name: 'Roles & Permissions',
    category: 'Administration & Security',
    description: 'Configure dynamic user roles and module-level read, write, and delete permissions',
  },

  // Support & Reviews
  {
    slug: 'REVIEWS',
    name: 'Ratings & Reviews',
    category: 'Support & Reviews',
    description: 'Monitor patient doctor reviews, star ratings, and consultation feedback',
  },
  {
    slug: 'PATIENT_SUPPORT',
    name: 'Patient Support',
    category: 'Support & Reviews',
    description: 'Handle patient support inquiries, live chat, and customer service tickets',
  },
  {
    slug: 'DOCTOR_SUPPORT',
    name: 'Doctor Support',
    category: 'Support & Reviews',
    description: 'Manage doctor inquiries, clinical support tickets, and communication',
  },
  {
    slug: 'SUPPORT',
    name: 'General Support',
    category: 'Support & Reviews',
    description: 'System-wide support ticketing and inquiry help desk',
  },
];

export type RbacAction = 'read' | 'create' | 'update' | 'delete' | 'manage' | 'write';

function normalizePermissionRow(
  p: Partial<PermissionInput> & { module_slug: string; role_name?: string }
): PermissionInput & { role_name?: string } {
  const canReadRaw = Boolean(p.can_read);
  const canWriteLegacy = Boolean(p.can_write);
  const canCreateRaw =
    p.can_create !== undefined && p.can_create !== null ? Boolean(p.can_create) : canWriteLegacy;
  const canUpdateRaw =
    p.can_update !== undefined && p.can_update !== null ? Boolean(p.can_update) : canWriteLegacy;
  const canDeleteRaw = Boolean(p.can_delete);
  const canManage =
    p.can_manage !== undefined && p.can_manage !== null
      ? Boolean(p.can_manage)
      : canReadRaw && canCreateRaw && canUpdateRaw && canDeleteRaw;

  const canRead = canManage || canReadRaw;
  const canCreate = canManage || canCreateRaw;
  const canUpdate = canManage || canUpdateRaw;
  const canDelete = canManage || canDeleteRaw;
  const canWrite = canManage || canCreate || canUpdate || canWriteLegacy;

  return {
    ...(p.role_name ? { role_name: p.role_name } : {}),
    module_slug: p.module_slug,
    can_read: canRead,
    can_write: canWrite,
    can_create: canCreate,
    can_update: canUpdate,
    can_delete: canDelete,
    can_manage: canManage,
  };
}

function satisfiesPermissionAction(perm: PermissionInput, action: RbacAction): boolean {
  const norm = normalizePermissionRow(perm);
  if (norm.can_manage) return true;
  switch (action) {
    case 'read':
      return norm.can_read;
    case 'create':
      return Boolean(norm.can_create);
    case 'update':
      return Boolean(norm.can_update);
    case 'delete':
      return norm.can_delete;
    case 'manage':
      return Boolean(norm.can_manage);
    case 'write':
      return Boolean(norm.can_write);
    default:
      return false;
  }
}

let granularColumnsEnsured = false;

async function ensureGranularPermissionColumns(client: {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}): Promise<void> {
  if (granularColumnsEnsured || process.env['NODE_ENV'] === 'test' || process.env['VITEST']) {
    return;
  }
  try {
    await client.query(`
      ALTER TABLE rbac_role_permissions
        ADD COLUMN IF NOT EXISTS can_create boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS can_update boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS can_manage boolean DEFAULT false
    `);
    granularColumnsEnsured = true;
  } catch {
    // Non-fatal if migration hasn't run yet or restricted DDL
  }
}

const DOCTOR_DEFAULT_PERMISSIONS: PermissionInput[] = [
  { module_slug: 'DOCTORS', can_read: true, can_create: false, can_update: true, can_write: true, can_delete: false, can_manage: false },
  { module_slug: 'AVAILABILITY', can_read: true, can_create: true, can_update: true, can_write: true, can_delete: true, can_manage: true },
  { module_slug: 'APPOINTMENTS', can_read: true, can_create: true, can_update: true, can_write: true, can_delete: true, can_manage: true },
  { module_slug: 'TODAYS_SCHEDULE', can_read: true, can_create: true, can_update: true, can_write: true, can_delete: true, can_manage: true },
  { module_slug: 'PATIENTS', can_read: true, can_create: true, can_update: true, can_write: true, can_delete: false, can_manage: false },
  { module_slug: 'PRESCRIPTIONS', can_read: true, can_create: true, can_update: true, can_write: true, can_delete: true, can_manage: true },
  { module_slug: 'MEDICINE_PACKAGES', can_read: true, can_create: false, can_update: false, can_write: false, can_delete: false, can_manage: false },
  { module_slug: 'REVIEWS', can_read: true, can_create: false, can_update: false, can_write: false, can_delete: false, can_manage: false },
  { module_slug: 'DOCTOR_SUPPORT', can_read: true, can_create: true, can_update: true, can_write: true, can_delete: false, can_manage: false },
  { module_slug: 'SUPPORT', can_read: true, can_create: true, can_update: true, can_write: true, can_delete: false, can_manage: false },
];

async function upsertRolePermissions(
  client: any,
  roleName: string,
  permissions: PermissionInput[]
): Promise<void> {
  for (const rawPerm of permissions) {
    const slug = (rawPerm.module_slug || '').trim().toUpperCase();
    if (!slug) continue;

    // Guarantee module slug exists in rbac_modules before FK insert
    const modDef = AVAILABLE_MODULES.find((m) => m.slug === slug);
    if (modDef) {
      await client.query(
        `INSERT INTO rbac_modules (slug, name, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO NOTHING`,
        [modDef.slug, modDef.name, modDef.description]
      );
    }

    const p = normalizePermissionRow({ ...rawPerm, module_slug: slug });

    await client.query(
      `INSERT INTO rbac_role_permissions (
         role_name, module_slug, can_read, can_write, can_delete, can_create, can_update, can_manage
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (role_name, module_slug) DO UPDATE SET
         can_read = EXCLUDED.can_read,
         can_write = EXCLUDED.can_write,
         can_delete = EXCLUDED.can_delete,
         can_create = EXCLUDED.can_create,
         can_update = EXCLUDED.can_update,
         can_manage = EXCLUDED.can_manage`,
      [
        roleName,
        slug,
        Boolean(p.can_read),
        Boolean(p.can_write),
        Boolean(p.can_delete),
        Boolean(p.can_create),
        Boolean(p.can_update),
        Boolean(p.can_manage),
      ]
    );
  }
}

export const rbacService = {
  async getModules() {
    const client = await pool.connect();
    try {
      // Self-heal: ensure all available application modules exist in rbac_modules
      for (const mod of AVAILABLE_MODULES) {
        try {
          await client.query(
            `INSERT INTO rbac_modules (slug, name, description)
             VALUES ($1, $2, $3)
             ON CONFLICT (slug) DO UPDATE SET
               name = EXCLUDED.name,
               description = EXCLUDED.description`,
            [mod.slug, mod.name, mod.description]
          );
        } catch {
          // Continue if already seeded or transient constraint
        }
      }

      const { rows } = await client.query(
        `SELECT slug, name, description FROM rbac_modules ORDER BY name ASC`
      );

      const categoryMap = new Map(AVAILABLE_MODULES.map((m) => [m.slug, m.category]));
      return rows.map((r) => ({
        ...r,
        category: categoryMap.get(r.slug) || 'General',
      }));
    } catch {
      // If DB error, gracefully fallback to AVAILABLE_MODULES so UI never breaks
      return AVAILABLE_MODULES;
    } finally {
      client.release();
    }
  },

  async getRoles() {
    const client = await pool.connect();
    try {
      await ensureGranularPermissionColumns(client);
      const { rows: roles } = await client.query(
        `SELECT name, description, is_system_role, created_at FROM rbac_roles ORDER BY created_at ASC`
      );

      let permissions: Array<Partial<PermissionInput> & { module_slug: string; role_name: string }>;
      try {
        const res = await client.query(
          `SELECT role_name, module_slug, can_read, can_write, can_delete, can_create, can_update, can_manage
           FROM rbac_role_permissions`
        );
        permissions = res.rows;
      } catch {
        const res = await client.query(
          `SELECT role_name, module_slug, can_read, can_write, can_delete FROM rbac_role_permissions`
        );
        permissions = res.rows;
      }

      const fullAdminPermissions = AVAILABLE_MODULES.map((m) =>
        normalizePermissionRow({
          module_slug: m.slug,
          can_read: true,
          can_create: true,
          can_update: true,
          can_write: true,
          can_delete: true,
          can_manage: true,
        })
      );

      const roleList = roles.map((role) => {
        const isSysAdmin =
          role.is_system_role ||
          ['SUPER_ADMIN', 'SUPER ADMIN', 'SYSTEM ADMINISTRATOR'].includes(
            (role.name || '').toUpperCase()
          );

        const rolePerms = permissions
          .filter((p) => p.role_name.toLowerCase() === role.name.toLowerCase())
          .map((p) => normalizePermissionRow(p));

        if (rolePerms.length > 0) {
          return {
            ...role,
            permissions: rolePerms,
          };
        }

        const roleUpper = (role.name || '').toUpperCase();
        if (isSysAdmin || roleUpper === 'ADMIN') {
          return {
            ...role,
            permissions: fullAdminPermissions.map((p) => ({
              role_name: role.name,
              ...p,
            })),
          };
        }

        return {
          ...role,
          permissions: [],
        };
      });

      // Ensure default system roles appear if not in database
      const existingNames = new Set(roleList.map((r) => r.name.toUpperCase()));
      if (!existingNames.has('SUPER_ADMIN') && !existingNames.has('ADMIN')) {
        roleList.unshift({
          name: 'ADMIN',
          description: 'Full access to all facilities, clinical modules, pharmacy, labs, and administration.',
          is_system_role: true,
          created_at: new Date(),
          permissions: fullAdminPermissions.map((p) => ({
            role_name: 'ADMIN',
            ...p,
          })),
        });
      }
      if (!existingNames.has('DOCTOR')) {
        roleList.push({
          name: 'DOCTOR',
          description: 'Access to appointment queues, patient consults, and e-prescriptions.',
          is_system_role: false,
          created_at: new Date(),
          permissions: DOCTOR_DEFAULT_PERMISSIONS.map((p) => ({
            role_name: 'DOCTOR',
            ...p,
          })),
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
      await ensureGranularPermissionColumns(client);
      const cleanName = (name || '').trim();
      const upper = cleanName.toUpperCase();
      const isSysAdmin =
        upper === 'SUPER_ADMIN' ||
        upper === 'ADMIN' ||
        upper === 'SUPER ADMIN' ||
        upper === 'ADMINISTRATOR' ||
        upper === 'SYSTEM ADMINISTRATOR';

      const fullAdminPermissions = AVAILABLE_MODULES.map((m) =>
        normalizePermissionRow({
          module_slug: m.slug,
          can_read: true,
          can_create: true,
          can_update: true,
          can_write: true,
          can_delete: true,
          can_manage: true,
        })
      );

      const { rows: roles } = await client.query(
        `SELECT name, description, is_system_role FROM rbac_roles WHERE LOWER(name) = LOWER($1)`,
        [cleanName]
      );

      // Auto-fallback only when role has not been persisted to rbac_roles yet
      if (roles.length === 0) {
        if (isSysAdmin) {
          return {
            name: cleanName,
            description: 'System Administrator with full access across all application modules',
            is_system_role: true,
            permissions: fullAdminPermissions,
          };
        }
        if (upper === 'DOCTOR') {
          return {
            name: 'DOCTOR',
            description: 'Doctor / Clinician',
            is_system_role: false,
            permissions: DOCTOR_DEFAULT_PERMISSIONS,
          };
        }
        if (upper === 'PATIENT') {
          const patientSlugs = ['PATIENTS', 'APPOINTMENTS', 'PRESCRIPTIONS', 'PATIENT_SUPPORT', 'SUPPORT'];
          const permissions = patientSlugs.map((slug) =>
            normalizePermissionRow({
              module_slug: slug,
              can_read: true,
              can_create: false,
              can_update: false,
              can_write: false,
              can_delete: false,
              can_manage: false,
            })
          );
          return {
            name: 'PATIENT',
            description: 'Patient',
            is_system_role: false,
            permissions,
          };
        }
        throw new NotFoundError('Role not found');
      }

      let rawPermissions: Array<Partial<PermissionInput> & { module_slug: string }>;
      try {
        const res = await client.query(
          `SELECT module_slug, can_read, can_write, can_delete, can_create, can_update, can_manage
           FROM rbac_role_permissions WHERE LOWER(role_name) = LOWER($1)`,
          [roles[0].name]
        );
        rawPermissions = res.rows;
      } catch {
        const res = await client.query(
          `SELECT module_slug, can_read, can_write, can_delete
           FROM rbac_role_permissions WHERE LOWER(role_name) = LOWER($1)`,
          [roles[0].name]
        );
        rawPermissions = res.rows;
      }

      // Return explicitly configured/saved permissions verbatim
      if (rawPermissions.length > 0) {
        return {
          ...roles[0],
          permissions: rawPermissions.map((p) => normalizePermissionRow(p)),
        };
      }

      // Default fallback only for unconfigured system administrator role
      if (roles[0].is_system_role || isSysAdmin) {
        return {
          ...roles[0],
          permissions: fullAdminPermissions,
        };
      }

      return { ...roles[0], permissions: [] };
    } finally {
      client.release();
    }
  },

  async hasPermission(
    roleName: string,
    moduleSlug: string,
    action: RbacAction,
    alternateSlugs?: string[]
  ): Promise<boolean> {
    const cleanRole = (roleName || '').trim();
    if (!cleanRole || !moduleSlug) return false;

    let role: Awaited<ReturnType<typeof this.getRoleByName>>;
    try {
      role = await this.getRoleByName(cleanRole);
    } catch (err) {
      if (err instanceof NotFoundError) return false;
      throw err;
    }

    const targetSlug = moduleSlug.trim().toUpperCase();
    const altSet = new Set((alternateSlugs || []).map((s) => s.trim().toUpperCase()));

    const perms: PermissionInput[] = Array.isArray(role.permissions) ? role.permissions : [];
    const direct = perms.find((p) => (p.module_slug || '').trim().toUpperCase() === targetSlug);

    if (direct) {
      if (satisfiesPermissionAction(direct, action)) return true;
      if (altSet.size > 0) {
        return perms.some(
          (p) =>
            altSet.has((p.module_slug || '').trim().toUpperCase()) &&
            satisfiesPermissionAction(p, action)
        );
      }
      return false;
    }

    if (altSet.size > 0) {
      const matchedAlt = perms.some(
        (p) =>
          altSet.has((p.module_slug || '').trim().toUpperCase()) &&
          satisfiesPermissionAction(p, action)
      );
      if (matchedAlt) return true;
    }

    // Super admin system roles default to true when no explicit denial row exists
    const upperName = (role.name || cleanRole).trim().toUpperCase();
    if (
      role.is_system_role ||
      upperName === 'SUPER_ADMIN' ||
      upperName === 'SUPER ADMIN' ||
      upperName === 'SYSTEM ADMINISTRATOR'
    ) {
      return true;
    }

    return false;
  },

  async createRole(data: RoleInput) {
    const client = await pool.connect();
    try {
      await ensureGranularPermissionColumns(client);
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO rbac_roles (name, description, is_system_role) VALUES ($1, $2, false)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
        [data.name, data.description]
      );

      await upsertRolePermissions(client, data.name, data.permissions);

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
      await ensureGranularPermissionColumns(client);
      await client.query('BEGIN');

      const cleanName = (name || '').trim();
      const { rows: existing } = await client.query(
        `SELECT name, is_system_role FROM rbac_roles WHERE LOWER(name) = LOWER($1)`,
        [cleanName]
      );

      let canonicalName = cleanName;
      if (existing.length > 0) {
        canonicalName = existing[0].name;
        await client.query(`UPDATE rbac_roles SET description = $1 WHERE name = $2`, [
          data.description || '',
          canonicalName,
        ]);
      } else {
        // Self-heal: ensure role exists in rbac_roles before foreign key insertion
        const isSys =
          cleanName.toUpperCase() === 'SUPER_ADMIN' ||
          cleanName.toUpperCase() === 'SYSTEM ADMINISTRATOR';

        await client.query(
          `INSERT INTO rbac_roles (name, description, is_system_role)
           VALUES ($1, $2, $3)
           ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
          [canonicalName, data.description || '', isSys]
        );
      }

      // Delete old permissions for this role
      await client.query(`DELETE FROM rbac_role_permissions WHERE LOWER(role_name) = LOWER($1)`, [
        canonicalName,
      ]);

      // Persist all module permissions (including explicit false rows)
      await upsertRolePermissions(client, canonicalName, data.permissions);

      await client.query('COMMIT');
      return this.getRoleByName(canonicalName);
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
  },
};
