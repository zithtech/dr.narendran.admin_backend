import type { Server } from 'socket.io';
import { getConversationRoom } from './socketRooms.js';

export interface ConvEntry {
  joinedAt: number;
  refreshedAt: number;
}

export const PRESENCE_TTL_MS = 60_000; // 60s TTL > pingTimeout(30s) + pingInterval(25s)

class PresenceManager {
  // Map of userId -> Set of active socket IDs
  private userSockets = new Map<string, Set<string>>();
  // Map of socketId -> userId
  private socketUsers = new Map<string, string>();
  // Map of socketId -> Map of conversationId -> ConvEntry
  private socketConversations = new Map<string, Map<string, ConvEntry>>();
  // Map of userId -> Map of conversationId -> ConvEntry
  private userConversations = new Map<string, Map<string, ConvEntry>>();
  private ioInstance: Server | null = null;

  setIO(io: Server): void {
    this.ioInstance = io;
  }

  addUserSocket(userId: string, socketId: string): boolean {
    let sockets = this.userSockets.get(userId);
    const wasOffline = !sockets || sockets.size === 0;

    if (!sockets) {
      sockets = new Set();
      this.userSockets.set(userId, sockets);
    }
    sockets.add(socketId);
    this.socketUsers.set(socketId, userId);

    if (wasOffline && this.ioInstance) {
      this.ioInstance.emit('chat:user:online', {
        userId,
        online: true,
      });
    }

    return wasOffline;
  }

  removeUserSocket(userId: string, socketId: string): boolean {
    this.clearSocketConversations(socketId);
    this.socketUsers.delete(socketId);

    const sockets = this.userSockets.get(userId);
    if (!sockets) return false;

    sockets.delete(socketId);

    if (sockets.size === 0) {
      this.userSockets.delete(userId);
      this.userConversations.delete(userId);
      if (this.ioInstance) {
        this.ioInstance.emit('chat:user:offline', {
          userId,
          online: false,
        });
      }
      return true;
    }

    return false;
  }

  joinConversation(userId: string, socketId: string, conversationId: string): void {
    if (!userId || !conversationId) return;

    const now = Date.now();
    const entry: ConvEntry = {
      joinedAt: now,
      refreshedAt: now,
    };

    // Register on socket
    let sConvs = this.socketConversations.get(socketId);
    if (!sConvs) {
      sConvs = new Map<string, ConvEntry>();
      this.socketConversations.set(socketId, sConvs);
    }
    sConvs.set(conversationId, entry);

    // Register on user
    let uConvs = this.userConversations.get(userId);
    if (!uConvs) {
      uConvs = new Map<string, ConvEntry>();
      this.userConversations.set(userId, uConvs);
    }
    uConvs.set(conversationId, entry);
  }

  heartbeat(userId: string, socketId: string, conversationId: string): void {
    if (!userId || !conversationId) return;

    const now = Date.now();

    const sConvs = this.socketConversations.get(socketId);
    if (sConvs && sConvs.has(conversationId)) {
      const sEntry = sConvs.get(conversationId)!;
      sEntry.refreshedAt = now;
    }

    const uConvs = this.userConversations.get(userId);
    if (uConvs && uConvs.has(conversationId)) {
      const uEntry = uConvs.get(conversationId)!;
      uEntry.refreshedAt = now;
    }
  }

  leaveConversation(userId: string, socketId: string, conversationId: string): void {
    if (!conversationId) return;

    // Remove from socket
    const sConvs = this.socketConversations.get(socketId);
    if (sConvs) {
      sConvs.delete(conversationId);
      if (sConvs.size === 0) {
        this.socketConversations.delete(socketId);
      }
    }

    // Recompute user active conversations from all active sockets of this user
    const socketIds = this.userSockets.get(userId);
    const updatedUserConvs = new Map<string, ConvEntry>();
    if (socketIds) {
      for (const sId of socketIds) {
        const convs = this.socketConversations.get(sId);
        if (convs) {
          for (const [cId, entry] of convs.entries()) {
            const existing = updatedUserConvs.get(cId);
            if (!existing || entry.refreshedAt > existing.refreshedAt) {
              updatedUserConvs.set(cId, entry);
            }
          }
        }
      }
    }

    if (updatedUserConvs.size > 0) {
      this.userConversations.set(userId, updatedUserConvs);
    } else {
      this.userConversations.delete(userId);
    }
  }

  clearSocketConversations(socketId: string): void {
    const convs = this.socketConversations.get(socketId);
    const userId = this.socketUsers.get(socketId);
    this.socketConversations.delete(socketId);

    if (userId && convs) {
      for (const conversationId of convs.keys()) {
        this.leaveConversation(userId, socketId, conversationId);
      }
    }
  }

  pruneStale(ttlMs: number = PRESENCE_TTL_MS): void {
    const now = Date.now();

    for (const [socketId, convs] of this.socketConversations.entries()) {
      for (const [convId, entry] of convs.entries()) {
        if (now - entry.refreshedAt > ttlMs) {
          convs.delete(convId);
        }
      }
      if (convs.size === 0) {
        this.socketConversations.delete(socketId);
      }
    }

    for (const [userId, convs] of this.userConversations.entries()) {
      for (const [convId, entry] of convs.entries()) {
        if (now - entry.refreshedAt > ttlMs) {
          convs.delete(convId);
        }
      }
      if (convs.size === 0) {
        this.userConversations.delete(userId);
      }
    }
  }

  isUserViewingConversation(
    userId?: string | null,
    conversationId?: string | null,
    ttlMs: number = PRESENCE_TTL_MS,
  ): boolean {
    if (!userId || !conversationId) return false;

    const userConvMap = this.userConversations.get(userId);
    if (!userConvMap || !userConvMap.has(conversationId)) {
      return false;
    }

    const userEntry = userConvMap.get(conversationId);
    if (!userEntry || Date.now() - userEntry.refreshedAt > ttlMs) {
      return false;
    }

    const socketIds = this.userSockets.get(userId);
    if (!socketIds || socketIds.size === 0) {
      return false;
    }

    if (this.ioInstance) {
      const convRoom1 = getConversationRoom(conversationId);
      const convRoom2 = `conversation:${conversationId}`;
      const room1 = this.ioInstance.sockets.adapter.rooms.get(convRoom1);
      const room2 = this.ioInstance.sockets.adapter.rooms.get(convRoom2);

      for (const socketId of socketIds) {
        const socketConvMap = this.socketConversations.get(socketId);
        if (socketConvMap && socketConvMap.has(conversationId)) {
          const socketEntry = socketConvMap.get(conversationId);
          if (socketEntry && Date.now() - socketEntry.refreshedAt <= ttlMs) {
            if ((room1 && room1.has(socketId)) || (room2 && room2.has(socketId))) {
              return true;
            }
          }
        }
      }
      return false;
    }

    return true;
  }

  getUserSockets(userId?: string | null): string[] {
    if (!userId) return [];
    const sockets = this.userSockets.get(userId);
    return sockets ? Array.from(sockets) : [];
  }

  isUserOnline(userId?: string | null): boolean {
    if (!userId) return false;
    const sockets = this.userSockets.get(userId);
    return Boolean(sockets && sockets.size > 0);
  }

  getOnlineUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }
}

export const presenceManager = new PresenceManager();

