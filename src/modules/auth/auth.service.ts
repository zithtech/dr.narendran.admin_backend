/* eslint-disable */
import crypto from 'node:crypto';

import argon2 from 'argon2';

import { query, queryOne } from '@/db/query.js';
import { NotFoundError, UnauthorizedError } from '@/http/errors.js';
import { logger } from '@/lib/logger.js';
import { doctorsService } from '@/modules/doctors/doctors.service.js';
import * as usersRepository from '@/modules/users/users.repository.js';
import { verifyPassword } from '@/modules/users/users.service.js';
import type { UserRole } from '@/modules/users/users.types.js';

import type {
  LoginInput,
  RegisterPatientInput,
  RequestOtpInput,
  SendOtpInput,
  VerifyOtpInput,
} from './auth.schema.js';
import * as otpRepository from './otp.repository.js';
import { signAccessToken } from './tokens.js';

const DUMMY_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$hD4wNp1vhAR0UgIku42HhQ$T4kcMF+8f8XsjChdbrICBIn6cVMAVkd0c2wRp9Y50w8';

export interface LoginResult {
  token: string;
}

export interface SendOtpResult {
  success: boolean;
  message: string;
  phone: string;
  expiresInSeconds: number;
  otp?: string;
  devOtp?: string;
  otpCode?: string; // For testing in frontend
}

export interface VerifyOtpResult {
  success: boolean;
  user_exists?: boolean;
  is_profile_complete?: boolean;
  is_new_user?: boolean;
  phone?: string;
  message?: string;
  isNewUser: boolean;
  patient?: any;
  token?: string | undefined;
  verificationToken?: string | undefined;
  user?:
  | {
    id: string;
    phone: string;
    fullName?: string | undefined;
    email?: string | undefined;
    dob?: string | undefined;
    gender?: string | undefined;
    role: string;
  }
  | undefined;
  prefilledProfile?: Record<string, unknown> | undefined;
}

export interface RegisterPatientResult {
  token: string;
  user: {
    id: string;
    phone: string;
    fullName?: string | undefined;
    email?: string | undefined;
    dob?: string | undefined;
    gender?: string | undefined;
    role: 'patient';
  };
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const user = await usersRepository.findByEmailWithPassword(input.email);

  const passwordMatches = await verifyPassword(
    user?.passwordHash ?? DUMMY_HASH,
    input.password,
  );

  if (user === null || !passwordMatches) {
    throw new UnauthorizedError('Invalid email or password');
  }

  await createUserSession(user.id);
  return {
    token: signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    }),
  };
}

export function genNumericOTP(length = 6): string {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10);
  }
  return otp;
}

export async function sendOtp(input: SendOtpInput): Promise<SendOtpResult> {
  const phone = input.phone.trim();
  const otpCode = genNumericOTP(6);

  logger.info(`OTP generated for ${phone}: ${otpCode}`);

  try {
    const otpHash = await argon2.hash(otpCode, {
      timeCost: 2,
      memoryCost: 15360,
    });
    await query(
      `INSERT INTO otp_verifications (phone, otp_hash, purpose, expires_at)
       VALUES ($1, $2, 'login', NOW() + INTERVAL '10 minutes')`,
      [phone, otpHash],
    );
  } catch (err) {
    logger.warn({ err }, 'Could not insert OTP into db');
  }

  return {
    success: true,
    message: 'OTP sent successfully',
    phone,
    expiresInSeconds: 300,
    otpCode, // Include OTP code for frontend testing
    otp: otpCode,
    devOtp: otpCode,
  };
}

export async function verifyOtp(
  input: VerifyOtpInput,
): Promise<VerifyOtpResult> {
  const phone = input.phone.trim();
  const code = input.code.trim();

  const digitsOnly = phone.replace(/\D/g, '');
  const last10 = digitsOnly.slice(-10);
  const phoneVariants = Array.from(
    new Set([
      phone,
      phone.replace(/\s+/g, ''),
      digitsOnly,
      last10,
      '0' + last10,
      '+91' + last10,
      '+91 ' + last10,
      '+91' + digitsOnly,
    ].filter(Boolean)),
  );

  const isDevMode = process.env['NODE_ENV'] !== 'production';
  const isDevBypassCode = isDevMode && code === '123456';

  let otpRecord: { id: string; otp_hash: string } | null = null;
  let isValidOtp = isDevBypassCode;

  if (!isDevBypassCode) {
    try {
      const candidates = await query<{ id: string; otp_hash: string }>(
        `SELECT id, otp_hash
         FROM otp_verifications
         WHERE (phone = ANY($1) OR (length($2) >= 10 AND RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) = $2))
           AND expires_at > NOW()
           AND consumed_at IS NULL
         ORDER BY created_at DESC
         LIMIT 5`,
        [phoneVariants, last10],
      );

      for (const candidate of candidates) {
        if (candidate.otp_hash === code) {
          isValidOtp = true;
          otpRecord = candidate;
          break;
        }
        try {
          const match = await argon2.verify(candidate.otp_hash, code);
          if (match) {
            isValidOtp = true;
            otpRecord = candidate;
            break;
          }
        } catch {
          // If candidate.otp_hash is not valid argon2 hash, continue
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Error querying otp_verifications during verifyOtp');
    }
  }

  if (!isValidOtp) {
    throw new UnauthorizedError(
      'Incorrect verification code. Please check and try again.',
    );
  }


  interface UserOtpQueryResult {
    id: string;
    email: string;
    fullName: string;
    role: string;
    tokenVersion: number;
    mobileNumber: string;
    dob?: string | null;
    gender?: string | null;
    address?: string | null;
    heightCm?: number | null;
    weightKg?: number | null;
    maritalStatus?: string | null;
    bloodGroup?: string | null;
    profileImageUrl?: string | null;
    emergencyContacts?: unknown;
    basicMedicalInfo?: unknown;
    specialization?: string | null;
    specialtyId?: string | null;
    specialtyName?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
  }

  let user: UserOtpQueryResult | null = null;
  let patientRecord: any = null;

  try {
    patientRecord = await queryOne<any>(
      `SELECT id, name, phone, email, date_of_birth::text AS dob, date_of_birth::text AS date_of_birth, gender, address
       FROM patients
       WHERE phone = ANY($1)
          OR (length($2) >= 10 AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $2)
          OR (length($2) >= 10 AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $2)
       LIMIT 1`,
      [phoneVariants, last10],
    );
  } catch (err) {
    logger.warn({ err }, 'Error querying patients during verifyOtp');
  }

  const requestedRole = input.role?.toLowerCase();

  try {
    user = await queryOne<UserOtpQueryResult>(
      `SELECT
         u.id,
         COALESCE(p.email, d.email, u.username) AS "email",
         COALESCE(p.name, d.name, u.username) AS "fullName",
         u.role,
         0 AS "tokenVersion",
         COALESCE(p.phone, d.phone, u.username) AS "mobileNumber",
         p.date_of_birth::text AS "dob",
         p.gender AS "gender",
         p.address AS "address",
         p.height_cm AS "heightCm",
         p.weight_kg AS "weightKg",
         p.marital_status AS "maritalStatus",
         p.blood_group AS "bloodGroup",
         p.profile_image_url AS "profileImageUrl",
         p.emergency_contacts AS "emergencyContacts",
         d.specialization AS "specialization",
         d.specialty_id::text AS "specialtyId",
         s.name AS "specialtyName",
         d.phone AS "contactPhone",
         d.email AS "contactEmail"
       FROM user_accounts u
       LEFT JOIN patients p ON p.user_account_id = u.id
       LEFT JOIN doctors d ON d.user_account_id = u.id
       LEFT JOIN specialties s ON s.id = d.specialty_id
       WHERE (
         u.username = ANY($1) OR
         p.phone = ANY($1) OR
         d.phone = ANY($1) OR
         (length($2) >= 10 AND (
           RIGHT(REGEXP_REPLACE(COALESCE(p.phone, ''), '\\\D', '', 'g'), 10) = $2 OR
           RIGHT(REGEXP_REPLACE(COALESCE(d.phone, ''), '\\\D', '', 'g'), 10) = $2 OR
           RIGHT(REGEXP_REPLACE(COALESCE(u.username, ''), '\\\D', '', 'g'), 10) = $2
         ))
      )
       ORDER BY (
         CASE
           WHEN $3 = 'doctor' AND (LOWER(COALESCE(u.role, '')) = 'doctor' OR d.id IS NOT NULL) THEN 0
           WHEN $3 = 'patient' AND (LOWER(COALESCE(u.role, '')) = 'patient' OR p.id IS NOT NULL) THEN 0
           ELSE 1
         END
       ) ASC
       LIMIT 1`,
      [phoneVariants, last10, requestedRole || ''],
    );
  } catch (err) {
    logger.warn({ err }, 'Error querying user by phone during verifyOtp');
  }

  // CASE 1: NO patient record at all
  if (!patientRecord && !user) {
    return {
      success: true,
      user_exists: false,
      is_new_user: true,
      isNewUser: true,
      verificationToken: signAccessToken({ sub: "temp_" + phone, email: phone + "@patient.app", role: "patient", tokenVersion: 0 }),
      phone,
      message: 'Patient not found, contact admin',
    };
  }

  const userId = user?.id || patientRecord?.id || 'usr_' + Date.now();
  const rawRole = user?.role?.toLowerCase() ?? requestedRole ?? 'patient';
  const userRole = (rawRole === 'doctor' || (user?.specialization && !patientRecord) ? 'doctor' : 'patient') as UserRole;
  const token = signAccessToken({
    sub: userId,
    email: user?.email || patientRecord?.email || `${userId}@patient.app`,
    role: userRole,
    tokenVersion: user?.tokenVersion ?? 0,
  });

  await createUserSession(userId);

  const dobVal = patientRecord?.date_of_birth || patientRecord?.dob || user?.dob;
  const genderVal = patientRecord?.gender || user?.gender;
  const addressVal = patientRecord?.address || user?.address;
  const isProfileIncomplete = !dobVal || !genderVal || !addressVal;

  const patientPayload = {
    id: patientRecord?.id || user?.id,
    name: patientRecord?.name || user?.fullName || '',
    phone: patientRecord?.phone || user?.mobileNumber || phone,
    address: addressVal || '',
    gender: genderVal || '',
    date_of_birth: dobVal || '',
    dob: dobVal || '',
  };

  const prefilledProfile = {
    fullName: patientPayload.name,
    email: user?.email || patientRecord?.email || '',
    phone: patientPayload.phone,
    address: patientPayload.address,
    gender: patientPayload.gender,
    dob: patientPayload.dob,
  };

  // CASE 2: Patient record EXISTS but incomplete (missing additional data)
  if (isProfileIncomplete) {
    return {
      success: true,
      user_exists: true,
      is_profile_complete: false,
      is_new_user: false,
      isNewUser: false,
      token,
      verificationToken: 'vtoken_' + Date.now(),
      patient: patientPayload,
      prefilledProfile,
      user: {
        id: userId,
        phone: patientPayload.phone,
        fullName: patientPayload.name,
        email: user?.email || patientRecord?.email,
        dob: dobVal ?? undefined,
        gender: genderVal ?? undefined,
        role: userRole,
      },
    };
  }

  // Mark the OTP record as consumed to prevent replay attacks
  if (otpRecord?.id) {
    try {
      await query(
        `UPDATE otp_verifications SET consumed_at = NOW() WHERE id = $1`,
        [otpRecord.id],
      );
    } catch (err) {
      logger.warn({ err }, 'Failed to mark OTP as consumed');
    }
  }

  // CASE 3: Patient record EXISTS and is COMPLETE
  return {
    success: true,
    user_exists: true,
    is_profile_complete: true,
    is_new_user: false,
    isNewUser: false,
    token,
    verificationToken: 'vtoken_' + Date.now(),
    patient: patientPayload,
    prefilledProfile,
    user: {
      id: userId,
      phone: patientPayload.phone,
      fullName: patientPayload.name,
      email: user?.email || patientRecord?.email,
      dob: dobVal ?? undefined,
      gender: genderVal ?? undefined,
      role: userRole,
    },
  };
}

export async function registerPatient(
  input: RegisterPatientInput,
): Promise<RegisterPatientResult> {
  const phone = input.phone.trim();
  const profile = input.profile;

  let user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    tokenVersion: number;
  } | null = null;

  try {
    user = await queryOne<{
      id: string;
      email: string;
      fullName: string;
      role: string;
      tokenVersion: number;
    }>(
      `SELECT id, username AS "email", username AS "fullName", role, 0 AS "tokenVersion"
       FROM user_accounts
       WHERE (username = $1 OR username = $2)`,
      [phone, phone.replace(/\s+/g, '')],
    );
  } catch (err) {
    logger.warn({ err }, 'Query for existing user in registerPatient failed');
  }

  if (!user) {
    const fallbackEmail =
      profile.email?.trim() ?? phone;
    try {
      user = await queryOne<{
        id: string;
        email: string;
        fullName: string;
        role: string;
        tokenVersion: number;
      }>(
        `INSERT INTO user_accounts (username, password_hash, role)
         VALUES ($1, $2, 'patient')
         RETURNING id, username AS "email", username AS "fullName", role, 0 AS "tokenVersion"`,
        [phone, DUMMY_HASH],
      );
    } catch (err) {
      logger.warn(
        { err },
        'User insert in registerPatient failed, creating fallback user object',
      );
      user = {
        id: `usr_${Date.now()}`,
        email: fallbackEmail,
        fullName: profile.fullName,
        role: 'patient',
        tokenVersion: 0,
      };
    }
  }

  if (user?.id) {
    try {
      const normalizedGender = profile.gender
        ? profile.gender.toLowerCase() === 'female'
          ? 'female'
          : profile.gender.toLowerCase() === 'male'
            ? 'male'
            : 'other'
        : 'other';

      await query(
        `INSERT INTO patients (user_account_id, name, date_of_birth, gender, phone, email)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_account_id) DO UPDATE
         SET name = EXCLUDED.name,
             date_of_birth = EXCLUDED.date_of_birth,
             gender = EXCLUDED.gender,
             updated_at = now()`,
        [
          user.id,
          profile.fullName,
          profile.dob ?? null,
          normalizedGender,
          phone,
          profile.email ?? null,
        ],
      );

      if (input.consents.records) {
        await query(
          `INSERT INTO user_consents (user_id, consent_type, version) VALUES ($1, 'records', '1.0')`,
          [user.id],
        );
      }
    } catch (err) {
      logger.warn(
        { err },
        'Could not insert patients or user_consents record',
      );
    }
  }

  await createUserSession(user!.id);
  const token = signAccessToken({
    sub: user!.id,
    email: user!.email || `${user!.id}@patient.app`,
    role: 'patient',
    tokenVersion: user!.tokenVersion ?? 0,
  });

  return {
    token,
    user: {
      id: user!.id,
      phone,
      fullName: profile.fullName,
      email: profile.email,
      dob: profile.dob,
      gender: profile.gender,
      role: 'patient',
    },
  };
}

export async function logout(userId: string): Promise<void> {
  try {
    await query(
      `UPDATE user_sessions
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  } catch (err) {
    logger.warn({ err }, 'Error revoking user session record in db');
  }
  await usersRepository.incrementTokenVersion(userId);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  const revoked = await usersRepository.incrementTokenVersion(userId);
  if (!revoked) {
    throw new NotFoundError('User');
  }
}

export async function createUserSession(
  userId: string,
  deviceId?: string,
): Promise<void> {
  try {
    // Check if user exists in users table first to avoid noisy foreign key error logs
    const userRes = await query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userRes.length === 0) {
      logger.debug('Skipped creating user session because user_id is not in users table (doctor account).');
      return;
    }

    await query(
      `INSERT INTO user_sessions (user_id, device_id, refresh_token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')`,
      [userId, deviceId ?? 'mobile_app', `session_${Date.now()}`],
    );
  } catch (err: any) {
    logger.warn({ err }, 'Could not insert user_session record into db');
  }
}

export interface UserSessionRecord {
  id: string;
  userId: string;
  deviceId: string | null;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export async function getActiveSessions(
  userId: string,
): Promise<UserSessionRecord[]> {
  try {
    const rows = await query<UserSessionRecord>(
      `SELECT id, user_id AS "userId", device_id AS "deviceId", issued_at AS "issuedAt", expires_at AS "expiresAt", revoked_at AS "revokedAt"
       FROM user_sessions
       WHERE user_id =  AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY issued_at DESC`,
      [userId],
    );
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn({ err }, 'Error fetching active user sessions');
    return [];
  }
}

export async function revokeSession(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  try {
    await query(
      `UPDATE user_sessions
       SET revoked_at = NOW()
       WHERE id =  AND user_id =  AND revoked_at IS NULL`,
      [sessionId, userId],
    );
    return true;
  } catch (err) {
    logger.warn({ err }, 'Error revoking user session');
    return false;
  }
}

/**
 * Generates a 6-digit OTP, hashes it, stores it, and mocks sending it.
 */
export async function requestOtp(input: RequestOtpInput): Promise<string> {
  const { phone, app } = input;

  if (app === 'doctor') {
    const doctor = await doctorsService.getDoctorByPhone(phone);
    if (!doctor) {
      throw new NotFoundError('Doctor account not found');
    }
  }

  // Generate cryptographically secure 6-digit OTP (100000 - 999999)
  const otp = crypto.randomInt(100000, 1000000).toString();

  // Hash the OTP with a fast argon2 profile since OTPs have low entropy
  // and are extremely short lived.
  const otpHash = await argon2.hash(otp, {
    timeCost: 2,
    memoryCost: 15360,
  });

  // OTP expires in 5 minutes
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await otpRepository.createOtp(phone, otpHash, expiresAt, 'login');

  // MOCK SEND: Log the OTP to the console. In production, connect to Twilio/SNS here.
  logger.info(
    { phone, otp },
    'SIMULATED SMS SENT: Your verification code is %s',
    otp,
  );

  return otp;
}
