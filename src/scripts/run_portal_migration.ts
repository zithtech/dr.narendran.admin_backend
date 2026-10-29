import { pool } from '../db/pool.js';

async function run() {
  const client = await pool.connect();
  try {
    console.log('Connected to DB. Applying migration...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_portal_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lab_id UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE UNIQUE,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        must_change_password BOOLEAN NOT NULL DEFAULT true,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created or verified lab_portal_users table.');

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'labs' AND column_name = 'contact_visibility'
        ) THEN
          ALTER TABLE labs ADD COLUMN contact_visibility BOOLEAN NOT NULL DEFAULT true;
        END IF;
      END $$;
    `);
    console.log('Added contact_visibility column to labs.');

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'lab_services' AND column_name = 'lab_id'
        ) THEN
          ALTER TABLE lab_services ADD COLUMN lab_id UUID REFERENCES labs(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'lab_services' AND column_name = 'description'
        ) THEN
          ALTER TABLE lab_services ADD COLUMN description TEXT;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'lab_services' AND column_name = 'price'
        ) THEN
          ALTER TABLE lab_services ADD COLUMN price NUMERIC(10, 2) DEFAULT 0;
        END IF;
      END $$;
    `);
    console.log('Added lab_id, description, price columns to lab_services.');

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

run();
