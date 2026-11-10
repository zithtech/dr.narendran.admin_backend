import { z } from 'zod';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const adminPatientListQuerySchema = z.object({
  search: z.string().trim().optional(),
  gender: z
    .enum(['ALL', 'MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED', 'all', 'male', 'female', 'other', 'unspecified'])
    .optional(),
  status: z
    .enum(['ALL', 'ACTIVE', 'INACTIVE', 'all', 'active', 'inactive'])
    .optional(),
  registeredFrom: z.string().trim().optional(),
  registeredTo: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const adminPatientTimelineQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    type: z.string().trim().optional().default('ALL'),
    eventTypes: z.string().trim().optional(),
    from_date: z.string().trim().optional(),
    fromDate: z.string().trim().optional(),
    to_date: z.string().trim().optional(),
    toDate: z.string().trim().optional(),
    year: z.string().trim().optional(),
  })
  .transform((data) => {
    // Normalize aliases
    const from_date = data.from_date || data.fromDate;
    const to_date = data.to_date || data.toDate;
    const type = data.type !== 'ALL' ? data.type : (data.eventTypes || 'ALL');

    return {
      page: data.page,
      limit: data.limit,
      type: type || 'ALL',
      from_date,
      to_date,
      year: data.year,
    };
  });

export interface AdminPatientTimelineQuery {
  page?: number | undefined;
  limit?: number | undefined;
  type?: string | undefined;
  from_date?: string | undefined;
  to_date?: string | undefined;
  year?: string | undefined;
}

export type AdminPatientListQuery = z.infer<typeof adminPatientListQuerySchema>;
