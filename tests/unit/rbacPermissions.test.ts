import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockRelease, mockConnect } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockRelease: vi.fn(),
  mockConnect: vi.fn(),
}));

vi.mock('@/db/pool.js', () => ({
  pool: {
    connect: mockConnect,
    query: mockQuery,
  },
}));

import { ForbiddenError } from '@/http/errors.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';
import { rbacService } from '@/modules/rbac/rbac.service.js';

describe('RBAC Service & Middleware Permission Enforcement', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockQuery.mockReset();
    mockRelease.mockReset();
    mockConnect.mockReset();
    mockConnect.mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    });
  });

  it('returns exact saved DB permissions for persisted DOCTOR role without overriding', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ name: 'DOCTOR', description: 'Clinician', is_system_role: false }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            module_slug: 'AVAILABILITY',
            can_read: true,
            can_write: false,
            can_delete: false,
          },
        ],
      });

    const role = await rbacService.getRoleByName('DOCTOR');

    expect(role.name).toBe('DOCTOR');
    expect(role.permissions).toEqual([
      {
        module_slug: 'AVAILABILITY',
        can_read: true,
        can_write: false,
        can_create: false,
        can_update: false,
        can_delete: false,
        can_manage: false,
      },
    ]);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('persists explicit false and granular 5-option permission rows in updateRole instead of skipping them', async () => {
    const executedQueries: Array<{ sql: string; params: unknown[] | undefined }> = [];

    mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
      executedQueries.push({ sql, params });
      if (sql.includes('SELECT name, is_system_role FROM rbac_roles')) {
        return Promise.resolve({
          rows: [{ name: 'DOCTOR', is_system_role: false }],
        });
      }
      if (sql.includes('FROM rbac_role_permissions WHERE LOWER(role_name)')) {
        return Promise.resolve({
          rows: [
            {
              module_slug: 'AVAILABILITY',
              can_read: true,
              can_write: true,
              can_create: true,
              can_update: false,
              can_delete: false,
              can_manage: false,
            },
            {
              module_slug: 'LABS',
              can_read: false,
              can_write: false,
              can_create: false,
              can_update: false,
              can_delete: false,
              can_manage: false,
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    await rbacService.updateRole('DOCTOR', {
      name: 'DOCTOR',
      description: 'Updated doctor permissions',
      permissions: [
        {
          module_slug: 'AVAILABILITY',
          can_read: true,
          can_create: true,
          can_update: false,
          can_delete: false,
          can_manage: false,
        },
        {
          module_slug: 'LABS',
          can_read: false,
          can_create: false,
          can_update: false,
          can_delete: false,
          can_manage: false,
        },
      ],
    });

    const insertCalls = executedQueries.filter((q) =>
      q.sql.includes('INSERT INTO rbac_role_permissions')
    );

    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0]?.params).toEqual(['DOCTOR', 'AVAILABILITY', true, true, false, true, false, false]);
    expect(insertCalls[1]?.params).toEqual(['DOCTOR', 'LABS', false, false, false, false, false, false]);
  });

  it('hasPermission strictly distinguishes create, read, update, delete, and manage flags', async () => {
    vi.spyOn(rbacService, 'getRoleByName').mockResolvedValue({
      name: 'Doctor',
      description: 'Clinician',
      is_system_role: false,
      permissions: [
        {
          module_slug: 'AVAILABILITY',
          can_read: true,
          can_create: true,
          can_update: false,
          can_write: true,
          can_delete: false,
          can_manage: false,
        },
        {
          module_slug: 'DOCTORS',
          can_read: false,
          can_create: false,
          can_update: false,
          can_delete: false,
          can_manage: true,
        },
      ],
    });

    await expect(rbacService.hasPermission('Doctor', 'AVAILABILITY', 'read')).resolves.toBe(true);
    await expect(rbacService.hasPermission('Doctor', 'AVAILABILITY', 'create')).resolves.toBe(true);
    await expect(rbacService.hasPermission('Doctor', 'AVAILABILITY', 'update')).resolves.toBe(false);
    await expect(rbacService.hasPermission('Doctor', 'AVAILABILITY', 'delete')).resolves.toBe(false);
    await expect(rbacService.hasPermission('Doctor', 'AVAILABILITY', 'manage')).resolves.toBe(false);

    // can_manage grants full management across all 5 actions
    await expect(rbacService.hasPermission('Doctor', 'DOCTORS', 'create')).resolves.toBe(true);
    await expect(rbacService.hasPermission('Doctor', 'DOCTORS', 'read')).resolves.toBe(true);
    await expect(rbacService.hasPermission('Doctor', 'DOCTORS', 'update')).resolves.toBe(true);
    await expect(rbacService.hasPermission('Doctor', 'DOCTORS', 'delete')).resolves.toBe(true);
    await expect(rbacService.hasPermission('Doctor', 'DOCTORS', 'manage')).resolves.toBe(true);

    await expect(rbacService.hasPermission('Doctor', 'PHARMACY', 'read')).resolves.toBe(false);
  });

  it('requirePermission rejects write/delete requests with ForbiddenError when role only has read permission', async () => {
    vi.spyOn(rbacService, 'hasPermission')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    const makeReq = () =>
      ({
        headers: {},
        query: {},
        user: {
          id: 'doc-user-1',
          email: 'doctor@clinic.com',
          role: 'DOCTOR',
          rbacRole: 'Doctor',
        },
      }) as unknown as Request;

    const res = {} as Response;

    const nextRead = vi.fn() as unknown as NextFunction;
    await requirePermission('AVAILABILITY', 'read')(makeReq(), res, nextRead);
    await vi.waitFor(() => {
      expect(nextRead).toHaveBeenCalledWith();
    });

    const nextWrite = vi.fn() as unknown as NextFunction;
    await requirePermission('AVAILABILITY', 'write')(makeReq(), res, nextWrite);
    await vi.waitFor(() => {
      expect(nextWrite).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    const nextDelete = vi.fn() as unknown as NextFunction;
    await requirePermission('AVAILABILITY', 'delete')(makeReq(), res, nextDelete);
    await vi.waitFor(() => {
      expect(nextDelete).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });
});
