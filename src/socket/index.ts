import type { Server as HttpServer } from 'node:http';

import { Server } from 'socket.io';

import { env } from '@/config/env.js';

import { registerChatSocketHandlers } from './chatSocket.js';
import { presenceManager } from './presenceManager.js';
import { socketAuthMiddleware } from './socketAuth.js';

let ioInstance: Server | null = null;

export function initSocket(httpServer: HttpServer): Server {
  if (ioInstance) return ioInstance;

  const allowedOrigins =
    env.CORS_ORIGIN_LIST.length > 0 ? env.CORS_ORIGIN_LIST : '*';

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 30000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  presenceManager.setIO(io);

  // Periodically prune stale presence records whose heartbeats have expired
  const pruneInterval = setInterval(() => {
    presenceManager.pruneStale();
  }, 30_000);
  pruneInterval.unref();

  // Authenticate socket connections via JWT
  io.use((socket, next) => {
    void socketAuthMiddleware(socket, next);
  });

  io.on('connection', socket => {
    registerChatSocketHandlers(io, socket);
  });

  ioInstance = io;
  return io;
}

export function getIO(): Server {
  if (!ioInstance) {
    throw new Error('Socket.IO is not initialized yet');
  }
  return ioInstance;
}
