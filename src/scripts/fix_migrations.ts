import dotenv from 'dotenv';
import { Pool } from 'pg';
dotenv.config();

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

async function run() {
  const names = [
    '1000000000000_create-master-tables',
    '1000000000001_create-master-admin-users',
    '1000000000002_add-reset-token-admin',
    '1789430400000_create-users-table',
    '1789430400002_create-doctor-profiles',
    '1789430400003_create-appointments',
    '1790326463953_add-name-to-tenant-admin',
    '1790334418907_create-otp-verifications',
    '1790337895205_rename-otp-mobile-number-to-phone',
    '1790399659568_add-slot-length-to-doctor-availability',
    '1790401179057_create-doctor-blocked-dates',
    '1790688703740_add-advanced-medicine-fields'
  ];

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pgmigrations (
      id serial PRIMARY KEY,
      name varchar(255) NOT NULL,
      run_on timestamp NOT NULL
    )
  `);

  for (const name of names) {
    const { rowCount } = await pool.query('SELECT id FROM pgmigrations WHERE name = $1', [name]);
    if (rowCount === 0) {
      await pool.query('INSERT INTO pgmigrations (name, run_on) VALUES ($1, NOW())', [name]);
    }
  }

  console.log('Fixed pgmigrations table successfully!');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
