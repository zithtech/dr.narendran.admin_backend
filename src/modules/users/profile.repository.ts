/* eslint-disable */
import { query, queryOne } from '@/db/query.js';

export interface DoctorProfileInput {
  userId: string;
  fullName: string;
  qualifications?: string | undefined;
  specialtyId?: string | undefined;
  clinicName?: string | undefined;
  clinicAddress?: string | undefined;
  contactPhone?: string | undefined;
  contactEmail?: string | undefined;
  profileImageUrl?: string | undefined;
  registrationNumber?: string | undefined;
  experienceYears?: number | undefined;
  specialty?: string | undefined;
}

export async function upsertDoctorProfile(input: DoctorProfileInput) {
  const sql = `
    INSERT INTO doctor_profiles (
      user_id,
      full_name,
      qualifications,
      specialty_id,
      clinic_name,
      clinic_address,
      contact_phone,
      contact_email,
      profile_image_url,
      registration_number,
      experience_years
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
    )
    ON CONFLICT (user_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      qualifications = COALESCE(EXCLUDED.qualifications, doctor_profiles.qualifications),
      specialty_id = COALESCE(EXCLUDED.specialty_id, doctor_profiles.specialty_id),
      clinic_name = COALESCE(EXCLUDED.clinic_name, doctor_profiles.clinic_name),
      clinic_address = COALESCE(EXCLUDED.clinic_address, doctor_profiles.clinic_address),
      contact_phone = COALESCE(EXCLUDED.contact_phone, doctor_profiles.contact_phone),
      contact_email = COALESCE(EXCLUDED.contact_email, doctor_profiles.contact_email),
      profile_image_url = COALESCE(EXCLUDED.profile_image_url, doctor_profiles.profile_image_url),
      registration_number = COALESCE(EXCLUDED.registration_number, doctor_profiles.registration_number),
      experience_years = COALESCE(EXCLUDED.experience_years, doctor_profiles.experience_years),
      updated_at = now()
    RETURNING *
  `;

  const values = [
    input.userId,
    input.fullName,
    input.qualifications ?? null,
    input.specialtyId ?? null,
    input.clinicName ?? null,
    input.clinicAddress ?? null,
    input.contactPhone ?? null,
    input.contactEmail ?? null,
    input.profileImageUrl ?? null,
    input.registrationNumber ?? null,
    input.experienceYears ?? null,
    input.specialty ?? null,
  ];

  // We added $12 for specialty
  const sqlWithSpecialty = sql.replace(
    /experience_years\n    \) VALUES \(\n      \$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11\n    \)/,
    `experience_years,\n      specialty\n    ) VALUES (\n      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12\n    )`
  ).replace(
    /experience_years = COALESCE\(EXCLUDED.experience_years, doctor_profiles.experience_years\),/,
    `experience_years = COALESCE(EXCLUDED.experience_years, doctor_profiles.experience_years),\n      specialty = COALESCE(EXCLUDED.specialty, doctor_profiles.specialty),`
  );

  const res = await queryOne(sqlWithSpecialty, values);

  try {
    await query(`
      UPDATE doctors 
      SET 
        name = COALESCE($1, name),
        specialization = COALESCE($2, specialization),
        clinic_address = COALESCE($3, clinic_address),
        years_of_experience = COALESCE($4, years_of_experience),
        qualification = COALESCE($5, qualification),
        medical_registration_number = COALESCE($6, medical_registration_number),
        profile_image_url = COALESCE($7, profile_image_url)
      WHERE user_account_id = $8
    `, [
      input.fullName ?? null,
      input.specialty ?? null,
      input.clinicAddress ?? null,
      input.experienceYears ?? null,
      input.qualifications ?? null,
      input.registrationNumber ?? null,
      input.profileImageUrl ?? null,
      input.userId
    ]);
  } catch (e) {
    console.error('Failed to update doctors table', e);
  }
  return res;
}

export async function getDoctorProfile(userId: string) {
  return queryOne(`SELECT * FROM doctor_profiles WHERE user_id = $1`, [userId]);
}

export async function getSpecialties() {
  return query(`SELECT id, name FROM specialties ORDER BY name ASC`);
}

export async function getSpecialtyByName(name: string) {
  return queryOne(`SELECT id, name FROM specialties WHERE name = $1`, [name]);
}
