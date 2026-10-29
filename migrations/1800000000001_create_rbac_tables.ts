import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Create RBAC Roles Table
  pgm.createTable('rbac_roles', {
    name: { type: 'varchar(50)', primaryKey: true },
    description: { type: 'text' },
    is_system_role: { type: 'boolean', default: false },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
  });

  // 2. Create Modules Table
  pgm.createTable('rbac_modules', {
    slug: { type: 'varchar(50)', primaryKey: true },
    name: { type: 'varchar(100)', notNull: true },
    description: { type: 'text' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
  });

  // 3. Create Role Permissions Mapping
  pgm.createTable('rbac_role_permissions', {
    role_name: { type: 'varchar(50)', notNull: true, references: 'rbac_roles(name)', onDelete: 'CASCADE' },
    module_slug: { type: 'varchar(50)', notNull: true, references: 'rbac_modules(slug)', onDelete: 'CASCADE' },
    can_read: { type: 'boolean', default: false },
    can_write: { type: 'boolean', default: false },
    can_delete: { type: 'boolean', default: false },
  });
  
  pgm.addConstraint('rbac_role_permissions', 'pk_rbac_role_permissions', {
    primaryKey: ['role_name', 'module_slug'],
  });

  // 4. Seed Initial Data
  pgm.sql(`
    INSERT INTO rbac_roles (name, description, is_system_role) VALUES 
    ('System Administrator', 'Has complete access to everything', true),
    ('Viewer', 'Can only view data', true),
    ('Lab Admin', 'Can only access lab portal', false);
    
    INSERT INTO rbac_modules (slug, name, description) VALUES 
    ('HOSPITALS', 'Hospitals', 'Manage hospitals'),
    ('BRANCHES', 'Branches', 'Manage branches'),
    ('DOCTORS', 'Doctors', 'Manage doctors'),
    ('PATIENTS', 'Patients', 'Manage patients'),
    ('LABS', 'Linked Labs', 'Manage linked labs'),
    ('LAB_SERVICES', 'Lab Services', 'Manage lab services master list'),
    ('USERS', 'User Accounts', 'Manage admin and staff accounts'),
    ('PRESCRIPTIONS', 'Prescription Templates', 'Manage templates');

    -- Give System Administrator all permissions
    INSERT INTO rbac_role_permissions (role_name, module_slug, can_read, can_write, can_delete)
    SELECT 'System Administrator', slug, true, true, true FROM rbac_modules;

    -- Give Viewer read-only permissions
    INSERT INTO rbac_role_permissions (role_name, module_slug, can_read, can_write, can_delete)
    SELECT 'Viewer', slug, true, false, false FROM rbac_modules;

    -- Give Lab Admin access only to LABS and LAB_SERVICES
    INSERT INTO rbac_role_permissions (role_name, module_slug, can_read, can_write, can_delete)
    VALUES 
    ('Lab Admin', 'LABS', true, true, false),
    ('Lab Admin', 'LAB_SERVICES', true, true, false);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('rbac_role_permissions');
  pgm.dropTable('rbac_modules');
  pgm.dropTable('rbac_roles');
}
