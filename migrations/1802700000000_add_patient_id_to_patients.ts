import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE SEQUENCE IF NOT EXISTS patient_id_seq START WITH 1;

    ALTER TABLE patients
      ADD COLUMN IF NOT EXISTS patient_id VARCHAR(50);

    -- Backfill existing rows with PA_001, PA_002... in chronological order of creation
    DO $$
    DECLARE
      rec RECORD;
      cnt INT := 0;
    BEGIN
      SELECT COALESCE(MAX(SUBSTRING(patient_id FROM 4)::INTEGER), 0) INTO cnt 
      FROM patients 
      WHERE patient_id ~ '^PA_[0-9]+$';

      FOR rec IN SELECT id FROM patients WHERE patient_id IS NULL ORDER BY created_at ASC, id ASC LOOP
        cnt := cnt + 1;
        UPDATE patients SET patient_id = 'PA_' || LPAD(cnt::TEXT, 3, '0') WHERE id = rec.id;
      END LOOP;

      IF cnt > 0 THEN
        PERFORM setval('patient_id_seq', cnt, true);
      END IF;
    END $$;

    -- Set default value for future inserts
    ALTER TABLE patients
      ALTER COLUMN patient_id SET DEFAULT ('PA_' || LPAD(nextval('patient_id_seq')::TEXT, 3, '0'));

    CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_patients_patient_id;
    ALTER TABLE patients DROP COLUMN IF EXISTS patient_id;
    DROP SEQUENCE IF EXISTS patient_id_seq;
  `);
}

