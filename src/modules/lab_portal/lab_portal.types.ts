import type { Request } from 'express';

export interface LabPortalUser {
  id: string;
  lab_id: string;
  username: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE';
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabPortalAuthPayload {
  userId: string;
  labId: string;
  username: string;
  email: string;
  type: 'LAB_PORTAL_CLIENT';
}

export interface AuthenticatedLabRequest extends Request {
  labUser?: LabPortalAuthPayload;
}
