import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO rbac_modules (slug, name, description) VALUES
      ('HOSPITALS', 'Hospitals', 'Manage hospitals, medical centers, and main facility profiles'),
      ('BRANCHES', 'Hospital Branches', 'Manage hospital branch locations, clinics, and contact details'),
      ('DOCTORS', 'Doctors', 'Manage doctor profiles, specializations, qualifications, and credentials'),
      ('AVAILABILITY', 'Availability & Slots', 'Configure doctor weekly consultation hours and appointment slot duration'),
      ('APPOINTMENTS', 'Appointments', 'Schedule, track, manage, reschedule, and cancel patient consultations'),
      ('TODAYS_SCHEDULE', 'Today''s Schedule', 'Live daily queue, token callouts, and doctor consultation tracking'),
      ('PATIENTS', 'Patients', 'Manage patient records, demographics, blood group, and registration'),
      ('PRESCRIPTIONS', 'Prescriptions', 'Create, view, and print doctor e-prescriptions and clinical records'),
      ('PHARMACY', 'Pharmacy', 'Manage medicines master catalog, generic formulations, brands, and pricing'),
      ('INVENTORY', 'Medicine Inventory', 'Track medicine stock levels, batch numbers, reorder points, and expiry'),
      ('MEDICINE_PACKAGES', 'Medicine Packages', 'Create, edit, and group pharmacy medicines into reusable consultation packages'),
      ('ORDERS', 'Pharmacy Orders', 'Manage patient pharmacy orders, fulfillment status, and order dispatch'),
      ('LABS', 'Linked Labs', 'Manage connected diagnostic laboratories, partner centers, and credentials'),
      ('LAB_SERVICES', 'Lab Services', 'Manage diagnostic lab test master list, test parameters, sample types, and pricing'),
      ('LINKED_MEDICALS', 'Linked Medicals', 'Manage affiliated retail pharmacies, medical stores, and partner locations'),
      ('CLIENT_PORTALS', 'Client Portals', 'Manage external lab partner credentials, unique login tokens, and portal access'),
      ('USERS', 'User Accounts', 'Manage administrator and staff system login accounts, active status, and passwords'),
      ('STAFF', 'Staff Management', 'Manage hospital staff profiles, employee codes, shift timings, and documents'),
      ('ROLES', 'Roles & Permissions', 'Configure dynamic user roles and module-level read, write, and delete permissions'),
      ('REVIEWS', 'Ratings & Reviews', 'Monitor patient doctor reviews, star ratings, and consultation feedback'),
      ('PATIENT_SUPPORT', 'Patient Support', 'Handle patient support inquiries, live chat, and customer service tickets'),
      ('DOCTOR_SUPPORT', 'Doctor Support', 'Manage doctor inquiries, clinical support tickets, and communication')
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description;

    -- Grant System Administrator access to all modules
    INSERT INTO rbac_role_permissions (role_name, module_slug, can_read, can_write, can_delete)
    SELECT 'System Administrator', slug, true, true, true
    FROM rbac_modules
    ON CONFLICT (role_name, module_slug) DO UPDATE SET
      can_read = true,
      can_write = true,
      can_delete = true;

    -- Grant Viewer read access to all modules
    INSERT INTO rbac_role_permissions (role_name, module_slug, can_read, can_write, can_delete)
    SELECT 'Viewer', slug, true, false, false
    FROM rbac_modules
    ON CONFLICT (role_name, module_slug) DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Safe rollback: keep core 8 modules
  pgm.sql(`
    DELETE FROM rbac_role_permissions WHERE module_slug NOT IN ('HOSPITALS', 'BRANCHES', 'DOCTORS', 'PATIENTS', 'LABS', 'LAB_SERVICES', 'USERS', 'PRESCRIPTIONS', 'STAFF');
    DELETE FROM rbac_modules WHERE slug NOT IN ('HOSPITALS', 'BRANCHES', 'DOCTORS', 'PATIENTS', 'LABS', 'LAB_SERVICES', 'USERS', 'PRESCRIPTIONS', 'STAFF');
  `);
}

