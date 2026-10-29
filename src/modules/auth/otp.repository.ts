import { query, queryOne } from '@/db/query.js';

export interface OtpVerification {
  id: string;
  mobileNumber: string;
  otpHash: string;
  purpose: 'login' | 'registration';
  expiresAt: Date;
  consumedAt: Date | null;
  attemptCount: number;
  createdAt: Date;
}

const OTP_COLUMNS = `
  id,
  phone AS "phone",
  otp_hash AS "otpHash",
  purpose,
  expires_at AS "expiresAt",
  consumed_at AS "consumedAt",
  attempt_count AS "attemptCount",
  created_at AS "createdAt"
`;

export async function createOtp(
  phone: string,
  otpHash: string,
  expiresAt: Date,
  purpose: 'login' | 'registration' = 'login',
): Promise<OtpVerification> {
  const row = await queryOne<OtpVerification>(
    `INSERT INTO otp_verifications (phone, otp_hash, expires_at, purpose)
     VALUES ($1, $2, $3, $4)
     RETURNING ${OTP_COLUMNS}`,
    [phone, otpHash, expiresAt.toISOString(), purpose],
  );

  if (row === null) {
    throw new Error('INSERT ... RETURNING produced no row');
  }

  return row;
}

/**
 * Finds the most recent unconsumed and unexpired OTP for a mobile number and purpose.
 * We also enforce that the attempt count is strictly less than 5.
 */
export async function findLatestPendingOtp(
  phone: string,
  purpose: 'login' | 'registration' = 'login',
): Promise<OtpVerification | null> {
  return queryOne<OtpVerification>(
    `SELECT ${OTP_COLUMNS}
     FROM otp_verifications
     WHERE phone = $1
       AND purpose = $2
       AND consumed_at IS NULL
       AND expires_at > now()
       AND attempt_count < 5
     ORDER BY created_at DESC
     LIMIT 1`,
    [phone, purpose],
  );
}

export async function incrementAttempt(id: string): Promise<void> {
  await query(
    `UPDATE otp_verifications
     SET attempt_count = attempt_count + 1
     WHERE id = $1`,
    [id],
  );
}

export async function markConsumed(id: string): Promise<void> {
  await query(
    `UPDATE otp_verifications
     SET consumed_at = now()
     WHERE id = $1`,
    [id],
  );
}
