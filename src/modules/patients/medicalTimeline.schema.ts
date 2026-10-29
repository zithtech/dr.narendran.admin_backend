import { z } from 'zod';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const getMedicalTimelineSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    type: z
      .enum([
        'ALL',
        'CONSULTATION',
        'PRESCRIPTION',
        'MEDICINE',
        'MEDICINE_STARTED',
        'MEDICINE_CHANGED',
        'MEDICINE_STOPPED',
        'INVESTIGATION',
        'LAB_TEST_ORDERED',
        'REPORT',
        'LAB_REPORT',
        'MEDICAL_RECORD',
        'IMAGING',
        'DOCTOR_NOTE',
        'APPOINTMENT',
        'FOLLOW_UP',
      ])
      .optional()
      .default('ALL'),
    from_date: z
      .string()
      .regex(DATE_REGEX, 'from_date must be in YYYY-MM-DD format')
      .optional(),
    to_date: z
      .string()
      .regex(DATE_REGEX, 'to_date must be in YYYY-MM-DD format')
      .optional(),
  })
  .refine(
    (data) => {
      if (data.from_date && data.to_date) {
        return new Date(data.from_date) <= new Date(data.to_date);
      }
      return true;
    },
    {
      message: 'from_date must be less than or equal to to_date',
      path: ['from_date'],
    },
  );

export const getMedicalHistorySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    type: z
      .enum([
        'ALL',
        'CONSULTATION',
        'PRESCRIPTION',
        'MEDICINE',
        'MEDICINE_STARTED',
        'MEDICINE_CHANGED',
        'MEDICINE_STOPPED',
        'INVESTIGATION',
        'LAB_TEST_ORDERED',
        'REPORT',
        'LAB_REPORT',
        'MEDICAL_RECORD',
        'IMAGING',
        'DOCTOR_NOTE',
        'APPOINTMENT',
        'FOLLOW_UP',
      ])
      .optional()
      .default('ALL'),
    from_date: z
      .string()
      .regex(DATE_REGEX, 'from_date must be in YYYY-MM-DD format')
      .optional(),
    to_date: z
      .string()
      .regex(DATE_REGEX, 'to_date must be in YYYY-MM-DD format')
      .optional(),
  })
  .refine(
    (data) => {
      if (data.from_date && data.to_date) {
        return new Date(data.from_date) <= new Date(data.to_date);
      }
      return true;
    },
    {
      message: 'from_date must be less than or equal to to_date',
      path: ['from_date'],
    },
  );

export const medicalSummaryQuerySchema = z
  .object({
    from_date: z
      .string()
      .regex(DATE_REGEX, 'from_date must be in YYYY-MM-DD format')
      .optional(),
    to_date: z
      .string()
      .regex(DATE_REGEX, 'to_date must be in YYYY-MM-DD format')
      .optional(),
    sections: z
      .union([
        z.string(),
        z.array(
          z.enum([
            'HEALTH_SUMMARY',
            'CONSULTATIONS',
            'DIAGNOSES',
            'PRESCRIPTIONS',
            'MEDICINES',
            'INVESTIGATIONS',
            'LAB_REPORTS',
            'MEDICAL_RECORDS',
            'APPOINTMENTS',
            'MEDICINE_TRACKING',
            'RECENT_ADVICE',
          ]),
        ),
      ])
      .optional(),
  })
  .refine(
    (data) => {
      if (data.from_date && data.to_date) {
        return new Date(data.from_date) <= new Date(data.to_date);
      }
      return true;
    },
    {
      message: 'from_date must be less than or equal to to_date',
      path: ['from_date'],
    },
  );

export const medicalSummaryBodySchema = z
  .object({
    date_range: z
      .object({
        from: z
          .string()
          .regex(DATE_REGEX, 'from must be in YYYY-MM-DD format')
          .optional(),
        to: z
          .string()
          .regex(DATE_REGEX, 'to must be in YYYY-MM-DD format')
          .optional(),
      })
      .optional(),
    from_date: z
      .string()
      .regex(DATE_REGEX, 'from_date must be in YYYY-MM-DD format')
      .optional(),
    to_date: z
      .string()
      .regex(DATE_REGEX, 'to_date must be in YYYY-MM-DD format')
      .optional(),
    sections: z
      .array(
        z.enum([
          'HEALTH_SUMMARY',
          'CONSULTATIONS',
          'DIAGNOSES',
          'PRESCRIPTIONS',
          'MEDICINES',
          'INVESTIGATIONS',
          'LAB_REPORTS',
          'MEDICAL_RECORDS',
          'APPOINTMENTS',
          'MEDICINE_TRACKING',
          'RECENT_ADVICE',
        ]),
      )
      .optional(),
  })
  .refine(
    (data) => {
      const from = data.from_date || data.date_range?.from;
      const to = data.to_date || data.date_range?.to;
      if (from && to) {
        return new Date(from) <= new Date(to);
      }
      return true;
    },
    {
      message: 'from date must be less than or equal to to date',
      path: ['from_date'],
    },
  );
