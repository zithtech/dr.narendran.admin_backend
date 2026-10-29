import {z} from 'zod';

export const genderSchema = z.enum([
  'male',
  'female',
  'other',
  'prefer_not_to_say',
]);

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  relationship: z.string().trim().min(1, 'Relationship is required'),
  phoneNumber: z.string().trim().min(5, 'Valid phone number is required'),
});

export function parseFlexibleDate(val: unknown): string | null | undefined {
  if (val === null || val === undefined) return val;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const yyyy = val.getUTCFullYear();
    const mm = String(val.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(val.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof val === 'number' && !Number.isNaN(val)) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();
  if (
    trimmed === '' ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'nan' ||
    lower === 'invalid date' ||
    lower === 'n/a' ||
    lower === 'na' ||
    lower === 'none' ||
    lower === '-' ||
    trimmed === '0000-00-00' ||
    trimmed === '00/00/0000'
  ) {
    return null;
  }

  // 1. YYYY-MM-DD format (e.g., 1990-05-15)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return trimmed;
  }

  // 2. ISO timestamp or SQL timestamp format (e.g., 1990-05-15T00:00:00.000Z or 1990-05-15 00:00:00)
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(trimmed)) {
    const d = new Date(trimmed.replace(' ', 'T'));
    if (!Number.isNaN(d.getTime())) {
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  // 3. DD/MM/YYYY, DD-MM-YYYY, or DD.MM.YYYY
  const ddmmyyyy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (ddmmyyyy?.[1] && ddmmyyyy[2] && ddmmyyyy[3]) {
    const p1 = parseInt(ddmmyyyy[1], 10);
    const p2 = parseInt(ddmmyyyy[2], 10);
    const year = parseInt(ddmmyyyy[3], 10);

    // Try DD/MM/YYYY first
    const dateObj = new Date(Date.UTC(year, p2 - 1, p1));
    if (
      p2 >= 1 &&
      p2 <= 12 &&
      dateObj.getUTCFullYear() === year &&
      dateObj.getUTCMonth() === p2 - 1 &&
      dateObj.getUTCDate() === p1
    ) {
      const mm = String(p2).padStart(2, '0');
      const dd = String(p1).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }

    // Try MM/DD/YYYY second
    const mmDateObj = new Date(Date.UTC(year, p1 - 1, p2));
    if (
      p1 >= 1 &&
      p1 <= 12 &&
      mmDateObj.getUTCFullYear() === year &&
      mmDateObj.getUTCMonth() === p1 - 1 &&
      mmDateObj.getUTCDate() === p2
    ) {
      const mm = String(p1).padStart(2, '0');
      const dd = String(p2).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }

  // 4. YYYY/MM/DD, YYYY-MM-DD, or YYYY.MM.DD
  const yyyymmdd = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(trimmed);
  if (yyyymmdd?.[1] && yyyymmdd[2] && yyyymmdd[3]) {
    const year = parseInt(yyyymmdd[1], 10);
    const month = parseInt(yyyymmdd[2], 10);
    const day = parseInt(yyyymmdd[3], 10);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    if (
      month >= 1 &&
      month <= 12 &&
      dateObj.getUTCFullYear() === year &&
      dateObj.getUTCMonth() === month - 1 &&
      dateObj.getUTCDate() === day
    ) {
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }

  // 5. Fallback Date.parse
  const timestamp = Date.parse(trimmed);
  if (!Number.isNaN(timestamp)) {
    const d = new Date(timestamp);
    if (!Number.isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return null;
}

export const flexibleDateSchema = z
  .preprocess(val => parseFlexibleDate(val), z.string().nullable().optional())
  .refine(
    val => !val || /^\d{4}-\d{2}-\d{2}$/.test(val),
    'Invalid date format (YYYY-MM-DD)',
  );


export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name cannot be empty').optional(),
  email: z.string().email('Invalid email address').optional(),
  mobileNumber: z.string().trim().optional(),
  dateOfBirth: flexibleDateSchema,
  date_of_birth: flexibleDateSchema,
  dob: flexibleDateSchema,
  gender: genderSchema.nullable().optional(),
  heightCm: z.union([z.number(), z.string()]).nullable().optional(),
  height_cm: z.union([z.number(), z.string()]).nullable().optional(),
  weightKg: z.union([z.number(), z.string()]).nullable().optional(),
  weight_kg: z.union([z.number(), z.string()]).nullable().optional(),
  maritalStatus: z.string().nullable().optional(),
  marital_status: z.string().nullable().optional(),
  bloodGroup: z.string().nullable().optional(),
  blood_group: z.string().nullable().optional(),
  addressLine1: z.string().nullable().optional(),
  addressLine2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  emergencyContacts: z.array(emergencyContactSchema).optional(),
});

export const updateMedicalInfoSchema = z.object({
  allergies: z.array(z.string().trim()).optional(),
  currentMedication: z.array(z.string().trim()).optional(),
  pastMedication: z.array(z.string().trim()).optional(),
  injuries: z.array(z.string().trim()).optional(),
  surgeries: z.array(z.string().trim()).optional(),
});

export const getUploadUrlSchema = z.object({
  contentType: z.string().default('image/jpeg'),
  documentType: z.string().optional(),
  fileName: z.string().optional(),
});

export const uploadAvatarSchema = z
  .object({
    avatarUrl: z.string().optional(),
    profileImageUrl: z.string().optional(),
    base64Image: z.string().optional(),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
  })
  .refine(
    data => !!(data.avatarUrl ?? data.profileImageUrl ?? data.base64Image),
    {
      message: 'Either avatarUrl, profileImageUrl, or base64Image is required',
    },
  );
