 
import { type MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

  // Drop FK first
  pgm.sql(`ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_medicine_id_fkey;`);

  // Convert medicines table
  pgm.sql(`ALTER TABLE medicines ALTER COLUMN id DROP DEFAULT;`);
  pgm.sql(`ALTER TABLE medicines ALTER COLUMN id SET DATA TYPE uuid USING (md5(id::text)::uuid);`);
  pgm.sql(`ALTER TABLE medicines ALTER COLUMN id SET DEFAULT uuid_generate_v4();`);
  pgm.sql(`DROP SEQUENCE IF EXISTS medicines_id_seq CASCADE;`);

  // Convert order_items table
  pgm.sql(`ALTER TABLE order_items ALTER COLUMN medicine_id SET DATA TYPE uuid USING (md5(medicine_id::text)::uuid);`);

  // Re-add FK
  pgm.sql(`ALTER TABLE order_items ADD CONSTRAINT order_items_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES medicines(id);`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // It's a one-way migration since reverting deterministic UUID back to integer is complex
  throw new Error("Irreversible migration");
}
