/* eslint-disable no-console */
import type { Request, Response } from 'express';

import { supportService } from './support.service.js';

export const getLegalDocument = async (req: Request, res: Response) => {
  try {
    const type = req.query['type'] as 'TERMS' | 'PRIVACY';
    if (type !== 'TERMS' && type !== 'PRIVACY') {
      res.status(400).json({ error: 'Invalid document type' });
      return;
    }
    const doc = await supportService.getLegalDocument(type);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json(doc);
    return;
  } catch (error) {
    console.error('Error in getLegalDocument:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

export const getFAQs = async (req: Request, res: Response) => {
  try {
    const category = req.query['category'] as string | undefined;
    const faqs = supportService.getFAQs(category);
    res.json(faqs);
    return;
  } catch (error) {
    console.error('Error in getFAQs:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

export const getContactInfo = async (_req: Request, res: Response) => {
  try {
    const info = supportService.getContactInfo();
    res.json(info);
    return;
  } catch (error) {
    console.error('Error in getContactInfo:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

export const getAboutInfo = async (_req: Request, res: Response) => {
  try {
    const info = supportService.getAboutInfo();
    res.json(info);
    return;
  } catch (error) {
    console.error('Error in getAboutInfo:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

export const getSystemLinks = async (_req: Request, res: Response) => {
  try {
    const links = supportService.getSystemLinks();
    res.json(links);
    return;
  } catch (error) {
    console.error('Error in getSystemLinks:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

/* ---------------- User App Preferences ---------------- */

export const getUserPreferences = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const preferences = await supportService.getUserPreferences(userId);
    res.json(preferences);
    return;
  } catch (error) {
    console.error('Error in getUserPreferences:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

export const saveUserPreferences = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const preferences = req.body;
    if (!preferences || typeof preferences !== 'object') {
      res.status(400).json({ error: 'Preferences payload must be an object' });
      return;
    }

    const saved = await supportService.saveUserPreferences(userId, preferences);
    res.json(saved);
    return;
  } catch (error) {
    console.error('Error in saveUserPreferences:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

export const resetUserPreferences = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await supportService.resetUserPreferences(userId);
    res.json(result);
    return;
  } catch (error) {
    console.error('Error in resetUserPreferences:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

/* ---------------- Privacy Concerns & Data Requests ---------------- */

export const raisePrivacyConcern = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const userType = req.user?.role || req.body.userType || 'DOCTOR';
    const { category, details, subject } = req.body;

    if (!userId || !category || !details) {
      res.status(400).json({ error: 'category and details are required' });
      return;
    }

    const result = await supportService.raisePrivacyConcern(
      userId,
      userType,
      category,
      details,
      subject,
    );
    res.status(201).json(result);
    return;
  } catch (error) {
    console.error('Error in raisePrivacyConcern:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

export const requestDataExport = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const userType = req.user?.role || req.body.userType || 'DOCTOR';
    const { format, details } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await supportService.requestDataExport(
      userId,
      userType,
      format || 'PDF',
      details,
    );
    res.status(201).json(result);
    return;
  } catch (error) {
    console.error('Error in requestDataExport:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

export const requestDataErasure = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const userType = req.user?.role || req.body.userType || 'DOCTOR';
    const { reason } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await supportService.requestDataErasure(userId, userType, reason);
    res.status(201).json(result);
    return;
  } catch (error) {
    console.error('Error in requestDataErasure:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

export const getPrivacyRequests = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const requests = await supportService.getPrivacyRequests(userId);
    res.json(requests);
    return;
  } catch (error) {
    console.error('Error in getPrivacyRequests:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

/* ---------------- Support Tickets ---------------- */

export const getSupportTickets = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.body.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const tickets = await supportService.getSupportTickets(userId);
    res.json(tickets);
    return;
  } catch (error) {
    console.error('Error in getSupportTickets:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

export const getSupportTicketById = async (req: Request, res: Response) => {
  try {
    const rawId = req.params['id'];
    const ticketId = Array.isArray(rawId) ? rawId[0] : rawId;
    const userId = req.user?.id;
    if (!ticketId) {
      res.status(400).json({ error: 'Ticket ID is required' });
      return;
    }
    const ticket = await supportService.getSupportTicketById(ticketId, userId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    res.json(ticket);
    return;
  } catch (error) {
    console.error('Error in getSupportTicketById:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

export const createSupportTicket = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const userType = req.user?.role || req.body.userType || 'UNKNOWN';
    const { subject, message } = req.body;

    if (!userId || !subject || !message) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const ticket = await supportService.createSupportTicket(userId, userType, subject, message);
    res.status(201).json(ticket);
    return;
  } catch (error) {
    console.error('Error in createSupportTicket:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

export const updateSupportTicketStatus = async (req: Request, res: Response) => {
  try {
    const rawId = req.params['id'];
    const ticketId = Array.isArray(rawId) ? rawId[0] : rawId;
    const { status } = req.body;

    if (!ticketId || !status) {
      res.status(400).json({ error: 'Ticket ID and status are required' });
      return;
    }

    const updated = await supportService.updateSupportTicketStatus(ticketId, status);
    if (!updated) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    res.json(updated);
    return;
  } catch (error) {
    console.error('Error in updateSupportTicketStatus:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};
