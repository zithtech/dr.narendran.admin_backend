 
import { type MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Create doctor_locations table
  pgm.createTable('doctor_locations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    doctor_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    location_name: { type: 'varchar(255)', notNull: true },
    address: { type: 'text' },
    map_link: { type: 'text' },
    is_primary: { type: 'boolean', notNull: true, default: false },
    status: { type: 'varchar(50)', notNull: true, default: 'Active' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // Ensure only one primary location per doctor (optional but good practice)
  pgm.createIndex('doctor_locations', ['doctor_id'], {
    where: 'is_primary = true',
    unique: true,
    name: 'idx_doctor_locations_primary',
  });

  // 2. Add location_id to doctor_availability
  pgm.addColumn('doctor_availability', {
    location_id: {
      type: 'uuid',
      references: 'doctor_locations(id)',
      onDelete: 'CASCADE',
    },
  });

  // 3. Migrate existing data
  // Clean up orphan rows if any (from incomplete tests/seeding)
  pgm.sql(`
    DELETE FROM doctor_availability
    WHERE doctor_id NOT IN (SELECT id FROM users);
  `);

  // For each distinct doctor_id in doctor_availability, create a default location
  pgm.sql(`
    INSERT INTO doctor_locations (doctor_id, location_name, is_primary)
    SELECT DISTINCT doctor_id, 'Main Clinic', true
    FROM doctor_availability;
  `);

  // Update existing availability with the new location_id
  pgm.sql(`
    UPDATE doctor_availability da
    SET location_id = dl.id
    FROM doctor_locations dl
    WHERE da.doctor_id = dl.doctor_id AND dl.is_primary = true;
  `);

  // Drop old unique constraint
  pgm.dropConstraint('doctor_availability', 'uq_doctor_day', { ifExists: true });

  // Add new unique constraint
  pgm.addConstraint(
    'doctor_availability',
    'uq_doctor_location_day',
    'UNIQUE (doctor_id, location_id, day_of_week)',
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Revert constraints
  pgm.dropConstraint('doctor_availability', 'uq_doctor_location_day', { ifExists: true });

  // Best effort to restore old constraint, might fail if data violates it
  pgm.addConstraint(
    'doctor_availability',
    'uq_doctor_day',
    'UNIQUE (doctor_id, day_of_week)',
  );

  pgm.dropColumn('doctor_availability', 'location_id');
  pgm.dropTable('doctor_locations');
}
