import { mapDatabaseError } from '@/db/errors.js';
import { query, queryOne } from '@/db/query.js';

import type {
  EmergencyContact,
  Gender,
  PatientMedicalInfo,
  PatientProfile,
  UpdateMedicalInfoData,
  UpdateProfileData,
} from './profile.types.js';

const DEFAULT_MEDICAL_INFO: PatientMedicalInfo = {
  allergies: [],
  currentMedication: [],
  pastMedication: [],
  injuries: [],
  surgeries: [],
};

const CONSTRAINT_MESSAGES = {
  users_email_lower_key: 'That email address is already registered.',
} as const;

interface DBProfileRow {
  userId: string;
  fullName: string;
  email: string;
  mobileNumber: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  heightCm: number | null;
  weightKg: number | null;
  maritalStatus: string | null;
  bloodGroup: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  profileImageUrl: string | null;
  emergencyContacts: unknown;
  basicMedicalInfo: unknown;
  createdAt: string;
  updatedAt: string;
}

export async function findByUserId(
  userId: string,
): Promise<PatientProfile | null> {
  // First ensure patient profile record exists or fetch
  const sql = `
    SELECT
      u.id                      AS "userId",
      COALESCE(p.name, u.username) AS "fullName",
      COALESCE(p.email, u.username) AS "email",
      COALESCE(p.phone, u.username) AS "mobileNumber",
      p.date_of_birth::text     AS "dateOfBirth",
      p.gender                  AS "gender",
      p.height_cm               AS "heightCm",
      p.weight_kg               AS "weightKg",
      p.marital_status          AS "maritalStatus",
      p.blood_group             AS "bloodGroup",
      p.address                 AS "addressLine1",
      NULL::text                AS "addressLine2",
      NULL::text                AS "city",
      NULL::text                AS "state",
      NULL::text                AS "postalCode",
      NULL::text                AS "country",
      p.profile_image_url       AS "profileImageUrl",
      COALESCE(p.emergency_contacts, '[]'::jsonb) AS "emergencyContacts",
      '{"allergies":[],"currentMedication":[],"pastMedication":[],"injuries":[],"surgeries":[]}'::jsonb AS "basicMedicalInfo",
      COALESCE(p.created_at, u.created_at) AS "createdAt",
      COALESCE(p.updated_at, u.updated_at) AS "updatedAt"
    FROM user_accounts u
    LEFT JOIN patients p ON p.user_account_id = u.id
    WHERE u.id = $1
  `;

  const row = await queryOne<DBProfileRow>(sql, [userId]);
  if (!row) {
    return null;
  }

  return formatProfileRow(row);
}

export async function upsertProfile(
  userId: string,
  data: UpdateProfileData,
): Promise<PatientProfile> {
  try {
    // 1. Update user_accounts table username if provided
    if (data.mobileNumber || data.email) {
      await query(
        `UPDATE user_accounts
         SET username = COALESCE($2, username),
             updated_at = now()
         WHERE id = $1`,
        [
          userId,
          data.mobileNumber ?? data.email ?? null,
        ],
      );
    }

    // 2. Fetch user's current username for fallback
    const user = await queryOne<{ fullName: string }>(
      `SELECT username AS "fullName" FROM user_accounts WHERE id = $1`,
      [userId],
    );
    const fullNameToSave = data.fullName ?? user?.fullName ?? 'Patient';

    // 3. Upsert patients row
    const dobVal = data.dateOfBirth ?? data.date_of_birth ?? data.dob ?? null;
    const heightVal = data.heightCm ?? data.height_cm ?? null;
    const weightVal = data.weightKg ?? data.weight_kg ?? null;
    const maritalStatusVal = data.maritalStatus ?? data.marital_status ?? null;
    const bloodGroupVal = data.bloodGroup ?? data.blood_group ?? null;
    const addressVal = data.addressLine1 ?? (data as Record<string, unknown>)['address'] ?? null;
    const emergencyContactsVal = data.emergencyContacts ? JSON.stringify(data.emergencyContacts) : null;

    await query(
      `INSERT INTO patients (
         user_account_id, name, date_of_birth, gender, phone, email,
         height_cm, weight_kg, marital_status, blood_group, address,
         emergency_contacts, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
       ON CONFLICT (user_account_id) DO UPDATE
       SET name = EXCLUDED.name,
           date_of_birth = COALESCE(EXCLUDED.date_of_birth, patients.date_of_birth),
           gender = COALESCE(EXCLUDED.gender, patients.gender),
           phone = COALESCE(EXCLUDED.phone, patients.phone),
           email = COALESCE(EXCLUDED.email, patients.email),
           height_cm = COALESCE(EXCLUDED.height_cm, patients.height_cm),
           weight_kg = COALESCE(EXCLUDED.weight_kg, patients.weight_kg),
           marital_status = COALESCE(EXCLUDED.marital_status, patients.marital_status),
           blood_group = COALESCE(EXCLUDED.blood_group, patients.blood_group),
           address = COALESCE(EXCLUDED.address, patients.address),
           emergency_contacts = COALESCE(EXCLUDED.emergency_contacts, patients.emergency_contacts),
           updated_at = now()`,
      [
        userId,
        fullNameToSave,
        dobVal,
        data.gender ?? null,
        data.mobileNumber ?? null,
        data.email ?? null,
        heightVal,
        weightVal,
        maritalStatusVal,
        bloodGroupVal,
        addressVal,
        emergencyContactsVal,
      ],
    );

    const updated = await findByUserId(userId);
    if (!updated) {
      throw new Error('Failed to retrieve updated profile.');
    }
    return updated;
  } catch (error) {
    throw mapDatabaseError(error, CONSTRAINT_MESSAGES);
  }
}

export async function upsertMedicalInfo(
  userId: string,
  data: UpdateMedicalInfoData,
): Promise<PatientMedicalInfo> {
  const current = await findByUserId(userId);
  const currentMedical = current?.basicMedicalInfo ?? DEFAULT_MEDICAL_INFO;

  const mergedMedicalInfo: PatientMedicalInfo = {
    allergies: data.allergies ?? currentMedical.allergies,
    currentMedication:
      data.currentMedication ?? currentMedical.currentMedication,
    pastMedication: data.pastMedication ?? currentMedical.pastMedication,
    injuries: data.injuries ?? currentMedical.injuries,
    surgeries: data.surgeries ?? currentMedical.surgeries,
  };

  const user = await queryOne<{ fullName: string }>(
    `SELECT username AS "fullName" FROM user_accounts WHERE id = $1`,
    [userId],
  );

  await query(
    `INSERT INTO patients (user_account_id, name, basic_medical_info, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_account_id) DO UPDATE
     SET basic_medical_info = EXCLUDED.basic_medical_info,
         updated_at = now()`,
    [userId, user?.fullName ?? 'Patient', JSON.stringify(mergedMedicalInfo)],
  );

  return mergedMedicalInfo;
}

export async function updateAvatarUrl(
  userId: string,
  avatarUrl: string,
): Promise<string> {
  const user = await queryOne<{ fullName: string }>(
    `SELECT username AS "fullName" FROM user_accounts WHERE id = $1`,
    [userId],
  );

  await query(
    `INSERT INTO patients (user_account_id, name, profile_image_url, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_account_id) DO UPDATE
     SET profile_image_url = EXCLUDED.profile_image_url,
         updated_at = now()`,
    [userId, user?.fullName ?? 'Patient', avatarUrl],
  );

  return avatarUrl;
}

function formatProfileRow(row: DBProfileRow): PatientProfile {
  let emergencyContacts: EmergencyContact[] = [];
  if (typeof row.emergencyContacts === 'string') {
    try {
      emergencyContacts = JSON.parse(
        row.emergencyContacts,
      ) as EmergencyContact[];
    } catch {
      emergencyContacts = [];
    }
  } else if (Array.isArray(row.emergencyContacts)) {
    emergencyContacts = row.emergencyContacts as EmergencyContact[];
  }

  let basicMedicalInfo: PatientMedicalInfo = DEFAULT_MEDICAL_INFO;
  if (typeof row.basicMedicalInfo === 'string') {
    try {
      basicMedicalInfo = JSON.parse(row.basicMedicalInfo) as PatientMedicalInfo;
    } catch {
      basicMedicalInfo = DEFAULT_MEDICAL_INFO;
    }
  } else if (row.basicMedicalInfo && typeof row.basicMedicalInfo === 'object') {
    const info = row.basicMedicalInfo as Record<string, unknown>;
    basicMedicalInfo = {
      allergies: Array.isArray(info['allergies'])
        ? (info['allergies'] as string[])
        : [],
      currentMedication: Array.isArray(info['currentMedication'])
        ? (info['currentMedication'] as string[])
        : [],
      pastMedication: Array.isArray(info['pastMedication'])
        ? (info['pastMedication'] as string[])
        : [],
      injuries: Array.isArray(info['injuries'])
        ? (info['injuries'] as string[])
        : [],
      surgeries: Array.isArray(info['surgeries'])
        ? (info['surgeries'] as string[])
        : [],
    };
  }

  return {
    userId: row.userId,
    fullName: row.fullName,
    email: row.email,
    mobileNumber: row.mobileNumber,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    heightCm:
      row.heightCm !== null && row.heightCm !== undefined
        ? Number(row.heightCm)
        : null,
    weightKg:
      row.weightKg !== null && row.weightKg !== undefined
        ? Number(row.weightKg)
        : null,
    maritalStatus: row.maritalStatus ?? null,
    bloodGroup: row.bloodGroup ?? null,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    profileImageUrl: row.profileImageUrl,
    emergencyContacts,
    basicMedicalInfo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
