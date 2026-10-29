import { Router } from 'express';

import { requireAuth } from '@/http/middleware/authenticate.js';
import { loginRateLimiter } from '@/http/middleware/rateLimit.js';
import { handler } from '@/http/middleware/validate.js';

import * as authController from './auth.controller.js';
import {
  loginSchema,
  registerPatientSchema,
  requestOtpSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from './auth.schema.js';

export const authRouter: Router = Router();

/* Standard Login */
authRouter.post(
  '/login',
  loginRateLimiter,
  ...handler({ body: loginSchema }, authController.login),
);

/* Single OTP Routes (Functional for both Patients and Doctors) */

// 1. Request OTP Route
authRouter.post(
  '/request-otp',
  loginRateLimiter,
  ...handler({ body: requestOtpSchema }, authController.requestOtp),
);

// 2. Verify OTP Route
authRouter.post(
  '/verify-otp',
  loginRateLimiter,
  ...handler({ body: verifyOtpSchema }, authController.verifyOtp),
);

// 3. Resend OTP Route
authRouter.post(
  '/resend-otp',
  loginRateLimiter,
  ...handler({ body: sendOtpSchema }, authController.sendOtp),
);

/* Additional OTP Route Aliases (for backward compatibility) */
authRouter.post(
  '/send-otp',
  loginRateLimiter,
  ...handler({ body: sendOtpSchema }, authController.sendOtp),
);
authRouter.post(
  '/otp/send',
  ...handler({ body: sendOtpSchema }, authController.sendOtp),
);
authRouter.post(
  '/otp/resend',
  ...handler({ body: sendOtpSchema }, authController.sendOtp),
);
authRouter.post(
  '/otp/verify',
  ...handler({ body: verifyOtpSchema }, authController.verifyOtp),
);

/* Patient Registration Route */
authRouter.post(
  '/register',
  ...handler({ body: registerPatientSchema }, authController.registerPatient),
);

/**
 * Returns the caller's own identity from token.
 */
authRouter.get('/me', requireAuth, (req, res) => {
  res.status(200).json({ user: req.user });
});

/**
 * Single device logout endpoint.
 */
authRouter.post('/logout', requireAuth, authController.logout);

/**
 * Revokes all sessions across all devices.
 */
authRouter.post('/logout-all', requireAuth, authController.logoutAll);

/**
 * View active device sessions for current user.
 */
authRouter.get('/sessions', requireAuth, authController.getActiveSessions);

/**
 * Revoke a specific device session by ID.
 */
authRouter.delete('/sessions/:id', requireAuth, authController.revokeSession);
