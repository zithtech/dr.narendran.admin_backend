import type { Socket } from 'socket.io';

import { verifyAccessToken } from '@/modules/auth/tokens.js';
import { chatService } from '@/modules/chat/chat.service.js';
import * as usersRepository from '@/modules/users/users.repository.js';

export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const authObj = socket.handshake.auth as Record<string, unknown> | undefined;
    const queryObj = socket.handshake.query as Record<string, unknown> | undefined;
    const headersObj = socket.handshake.headers as Record<string, unknown> | undefined;

    const rawToken =
      authObj?.['token'] ||
      headersObj?.['authorization'] ||
      queryObj?.['token'];

    if (!rawToken || typeof rawToken !== 'string') {
      return next(new Error('Authentication required'));
    }

    const token = rawToken.startsWith('Bearer ')
      ? rawToken.slice(7).trim()
      : rawToken.trim();

    if (!token) {
      return next(new Error('Invalid token'));
    }

    const payload = verifyAccessToken(token);

    const current = await usersRepository.findAuthContextById(payload.sub);
    if (!current) {
      return next(new Error('Session is no longer valid'));
    }

    if (current.tokenVersion !== payload.tokenVersion) {
      return next(new Error('Session has been revoked'));
    }

    const identity = await chatService.resolveUserIdentity(
      current.id,
      current.role,
    );

    // Explicitly set canonical userId and role on socket.data
    socket.data.userId = current.id;
    socket.data.role = current.role;
    socket.data.user = {
      id: current.id,
      email: current.email,
      role: current.role,
      patientId: identity.patientId,
      doctorId: identity.doctorId,
      userAccountId: identity.userAccountId || current.id,
      senderType: identity.senderType,
      name: identity.name,
    };

    next();
  } catch (err: any) {
    next(new Error(err?.message || 'Authentication failed'));
  }
}
