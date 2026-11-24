import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('patients', {
    referred_by: {
      type: 'VARCHAR(50)',
      notNull: false,
    },
    referral_id: {
      type: 'VARCHAR(100)',
      notNull: false,
    },
    referral_doctor_id: {
      type: 'VARCHAR(100)',
      notNull: false,
    },
  });

  pgm.createIndex('patients', 'referral_id', {
    name: 'idx_patients_referral_id',
    ifNotExists: true,
  });

  pgm.createIndex('patients', 'referral_doctor_id', {
    name: 'idx_patients_referral_doctor_id',
    ifNotExists: true,
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('patients', 'referral_doctor_id', {
    name: 'idx_patients_referral_doctor_id',
    ifExists: true,
  });
  pgm.dropIndex('patients', 'referral_id', {
    name: 'idx_patients_referral_id',
    ifExists: true,
  });
  pgm.dropColumns('patients', ['referred_by', 'referral_id', 'referral_doctor_id'], {
    ifExists: true,
  });
}
