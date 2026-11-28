import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE prescription_templates
    ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES hospital_branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS layout_config JSONB NULL,
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS updated_by UUID;

    CREATE INDEX IF NOT EXISTS idx_prescription_templates_hospital_status
    ON prescription_templates(hospital_id, status);

    CREATE INDEX IF NOT EXISTS idx_prescription_templates_hospital_default
    ON prescription_templates(hospital_id, is_default);

    CREATE UNIQUE INDEX IF NOT EXISTS uq_active_template_per_hospital
    ON prescription_templates(hospital_id)
    WHERE status = 'ACTIVE' AND hospital_id IS NOT NULL;

    UPDATE prescription_templates
    SET is_default = true
    WHERE hospital_id IS NULL;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS uq_active_template_per_hospital;
    DROP INDEX IF EXISTS idx_prescription_templates_hospital_default;
    DROP INDEX IF EXISTS idx_prescription_templates_hospital_status;

    ALTER TABLE prescription_templates
    DROP COLUMN IF EXISTS hospital_id,
    DROP COLUMN IF EXISTS branch_id,
    DROP COLUMN IF EXISTS is_default,
    DROP COLUMN IF EXISTS version,
    DROP COLUMN IF EXISTS layout_config,
    DROP COLUMN IF EXISTS created_by,
    DROP COLUMN IF EXISTS updated_by;
  `);
}
