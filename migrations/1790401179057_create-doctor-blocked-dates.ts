 
import type {MigrationBuilder} from 'node-pg-migrate';

export const shorthands = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('doctor_blocked_dates', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    doctor_id: {
      type: 'uuid',
      notNull: true,
      references: '"doctors"',
      onDelete: 'CASCADE',
    },
    blocked_date: {type: 'date', notNull: true},
    start_time: {type: 'time', notNull: true},
    end_time: {type: 'time', notNull: true},
    reason: {type: 'text'},
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
  }, {
    ifNotExists: true
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('doctor_blocked_dates', {ifExists: true});
}
