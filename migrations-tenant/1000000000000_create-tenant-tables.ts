/* eslint-disable */
// @ts-nocheck
import type {MigrationBuilder} from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createExtension('pgcrypto', {ifNotExists: true});

  // --- user_accounts ---
  pgm.createTable('user_accounts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    username: {type: 'varchar(255)', notNull: true, unique: true},
    password_hash: {type: 'text', notNull: true},
    role: {type: 'varchar(50)', notNull: true}, // ADMIN, DOCTOR, PATIENT
    status: {type: 'varchar(50)', notNull: true, default: 'ACTIVE'},
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // --- hospitals ---
  pgm.createTable('hospitals', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: {type: 'varchar(255)', notNull: true},
    hospital_code: {type: 'varchar(50)'},
    address: {type: 'text'},
    phone: {type: 'varchar(50)'},
    email: {type: 'varchar(255)'},
    status: {type: 'varchar(50)', notNull: true, default: 'ACTIVE'},
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // --- hospital_branches ---
  pgm.createTable('hospital_branches', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    hospital_id: {
      type: 'uuid',
      references: '"hospitals"',
      onDelete: 'CASCADE',
    },
    branch_code: {type: 'varchar(50)'},
    name: {type: 'varchar(255)', notNull: true},
    address: {type: 'text'},
    phone: {type: 'varchar(50)'},
    status: {type: 'varchar(50)', notNull: true, default: 'ACTIVE'},
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // --- doctors ---
  pgm.createTable('doctors', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_account_id: {
      type: 'uuid',
      references: '"user_accounts"',
      onDelete: 'CASCADE',
      unique: true,
    },
    hospital_id: {
      type: 'uuid',
      references: '"hospitals"',
      onDelete: 'CASCADE',
    },
    branch_id: {
      type: 'uuid',
      references: '"hospital_branches"',
      onDelete: 'SET NULL',
    },
    name: {type: 'varchar(255)', notNull: true},
    phone: {type: 'varchar(50)'},
    email: {type: 'varchar(255)'},
    specialization: {type: 'varchar(255)'},
    status: {type: 'varchar(50)', notNull: true, default: 'ACTIVE'},
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // --- doctor_availability ---
  pgm.createTable('doctor_availability', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    doctor_id: {type: 'uuid', references: '"doctors"', onDelete: 'CASCADE'},
    branch_id: {
      type: 'uuid',
      references: '"hospital_branches"',
      onDelete: 'CASCADE',
    },
    day_of_week: {type: 'varchar(20)', notNull: true}, // MONDAY, TUESDAY...
    start_time: {type: 'time', notNull: true},
    end_time: {type: 'time', notNull: true},
    status: {type: 'varchar(50)', notNull: true, default: 'ACTIVE'},
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // --- patients ---
  pgm.createTable('patients', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_account_id: {
      type: 'uuid',
      references: '"user_accounts"',
      onDelete: 'SET NULL',
      unique: true,
    },
    hospital_id: {
      type: 'uuid',
      references: '"hospitals"',
      onDelete: 'CASCADE',
    },
    branch_id: {
      type: 'uuid',
      references: '"hospital_branches"',
      onDelete: 'SET NULL',
    },
    name: {type: 'varchar(255)', notNull: true},
    phone: {type: 'varchar(50)'},
    email: {type: 'varchar(255)'},
    date_of_birth: {type: 'date'},
    gender: {type: 'varchar(50)'},
    address: {type: 'text'},
    status: {type: 'varchar(50)', notNull: true, default: 'ACTIVE'},
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Basic updated_at trigger function
  pgm.createFunction(
    'update_updated_at_column',
    [],
    {returns: 'trigger', language: 'plpgsql'},
    `
      BEGIN
          NEW.updated_at = current_timestamp;
          RETURN NEW;
      END;
    `,
  );

  const tables = [
    'user_accounts',
    'hospitals',
    'hospital_branches',
    'doctors',
    'doctor_availability',
    'patients',
  ];
  for (const table of tables) {
    pgm.createTrigger(table, 'set_updated_at', {
      when: 'BEFORE',
      operation: 'UPDATE',
      function: 'update_updated_at_column',
      level: 'ROW',
    });
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  const tables = [
    'patients',
    'doctor_availability',
    'doctors',
    'hospital_branches',
    'hospitals',
    'user_accounts',
  ];
  for (const table of tables) {
    pgm.dropTable(table);
  }
  pgm.dropFunction('update_updated_at_column', []);
}
