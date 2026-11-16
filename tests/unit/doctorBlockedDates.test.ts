import {beforeEach, describe, expect, it, vi} from 'vitest';

const {mockQuery, mockRelease, mockConnect} = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({query, release}));
  return {mockQuery: query, mockRelease: release, mockConnect: connect};
});

vi.mock('@/db/pool.js', () => ({
  pool: {
    connect: mockConnect,
    query: mockQuery,
  },
}));

vi.mock('@/modules/appointments/appointments.repository.js', () => ({
  getDoctorAvailability: vi.fn(),
}));

import {doctorAvailabilityService} from '@/modules/doctor_availability/doctor_availability.service.js';

describe('DoctorAvailabilityService blocked dates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not reference missing legacy start_date column in getBlockedDatesByDoctor', async () => {
    const executedSql: string[] = [];

    mockQuery.mockImplementation(async (sql: string) => {
      executedSql.push(sql);
      if (sql.includes("column_name = 'start_date'")) {
        return {rowCount: 0, rows: []};
      }
      if (sql.includes('FROM doctor_blocked_dates')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'blk-1',
              doctor_id: 'doc-1',
              blocked_date: '2099-12-25',
              start_time: '00:00:00',
              end_time: '23:59:59',
              reason: 'Holiday',
              created_at: '2026-11-12T10:00:00.000Z',
              updated_at: '2026-11-12T10:00:00.000Z',
            },
          ],
        };
      }
      return {rowCount: 0, rows: []};
    });

    const res = await doctorAvailabilityService.getBlockedDatesByDoctor('doc-1');

    const selectQuery = executedSql.find((q) =>
      q.includes('FROM doctor_blocked_dates'),
    );
    expect(selectQuery).toBeDefined();
    expect(selectQuery).not.toContain('start_date');
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      id: 'blk-1',
      doctor_id: 'doc-1',
      blocked_date: '2099-12-25',
      is_all_day: true,
      status: 'UPCOMING',
      reason: 'Holiday',
    });
    expect(mockRelease).toHaveBeenCalled();
  });

  it('preserves local calendar date without shifting back by UTC offset when Date object is returned', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("column_name = 'start_date'")) {
        return {rowCount: 0, rows: []};
      }
      if (sql.includes('FROM doctor_blocked_dates')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'blk-2',
              doctor_id: 'doc-1',
              blocked_date: new Date(2099, 11, 25),
              start_time: '10:00:00',
              end_time: '13:00:00',
              reason: 'Surgery',
              created_at: '2026-11-12T10:00:00.000Z',
              updated_at: '2026-11-12T10:00:00.000Z',
            },
          ],
        };
      }
      return {rowCount: 0, rows: []};
    });

    const res = await doctorAvailabilityService.getBlockedDatesByDoctor('doc-1');

    expect(res[0]?.blocked_date).toBe('2099-12-25');
    expect(res[0]?.is_all_day).toBe(false);
    expect(res[0]?.start_time).toBe('10:00');
    expect(res[0]?.end_time).toBe('13:00');
  });

  it('returns formatted blocked date metadata immediately from createBlockedDate', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("column_name = 'start_date'")) {
        return {rowCount: 0, rows: []};
      }
      if (sql.includes('INSERT INTO doctor_blocked_dates')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'blk-new',
              doctor_id: 'doc-1',
              blocked_date: new Date(2099, 11, 31),
              start_time: '00:00:00',
              end_time: '23:59:59',
              reason: 'Year End Leave',
              created_at: '2026-11-12T10:00:00.000Z',
              updated_at: '2026-11-12T10:00:00.000Z',
            },
          ],
        };
      }
      return {rowCount: 0, rows: []};
    });

    const created = await doctorAvailabilityService.createBlockedDate({
      doctor_id: 'doc-1',
      blocked_date: '2099-12-31',
      start_time: '00:00:00',
      end_time: '23:59:59',
      reason: 'Year End Leave',
    });

    expect(created).toMatchObject({
      id: 'blk-new',
      blocked_date: '2099-12-31',
      is_all_day: true,
      status: 'UPCOMING',
      reason: 'Year End Leave',
    });
  });
});

