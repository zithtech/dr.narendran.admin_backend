import type { NextFunction, Request, Response } from 'express';

import { UnauthorizedError } from '@/http/errors.js';
import type { ValidatedData } from '@/http/middleware/validate.js';

import type {
  loginSchema,
  registerPatientSchema,
  requestOtpSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from './auth.schema.js';
import * as authService from './auth.service.js';

type LoginRequest = ValidatedData<{ body: typeof loginSchema }>;
type SendOtpRequest = ValidatedData<{ body: typeof sendOtpSchema }>;
type VerifyOtpRequest = ValidatedData<{ body: typeof verifyOtpSchema }>;
type RegisterPatientRequest = ValidatedData<{
  body: typeof registerPatientSchema;
}>;
type RequestOtpRequest = ValidatedData<{ body: typeof requestOtpSchema }>;

export async function login(
  input: LoginRequest,
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await authService.login(input.body);
  res.status(200).json(result);
}

export async function sendOtp(
  input: SendOtpRequest,
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await authService.sendOtp(input.body);
  res.status(200).json(result);
}

export async function verifyOtp(
  input: VerifyOtpRequest,
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await authService.verifyOtp(input.body);
  res.status(200).json(result);
}

export async function registerPatient(
  input: RegisterPatientRequest,
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await authService.registerPatient(input.body);
  res.status(200).json(result);
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }
    await authService.logout(req.user.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function logoutAll(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }
    await authService.revokeAllSessions(req.user.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function getActiveSessions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }
    const sessions = await authService.getActiveSessions(req.user.id);
    res.status(200).json({ sessions });
  } catch (error) {
    next(error);
  }
}

export async function revokeSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }
    const rawId = req.params['id'];
    const sessionId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID is required.' });
      return;
    }
    await authService.revokeSession(req.user.id, sessionId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}


export async function requestOtp(
  input: RequestOtpRequest,
  _req: Request,
  res: Response,
): Promise<void> {
  const otp = await authService.requestOtp(input.body);
  res.status(200).json({ message: 'OTP sent successfully', otp, devOtp: otp });
}
