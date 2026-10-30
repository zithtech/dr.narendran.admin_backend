
function paramId(req: Request, paramName = 'id'): string {
  const p = req.params[paramName];
  if (Array.isArray(p)) return p[0] || '';
  return p || '';
}

import type { Request, Response } from 'express';

import { UnauthorizedError } from '@/http/errors.js';

import {
  articleFeedbackSchema,
  assignTicketSchema,
  createAiConversationSchema,
  createArticleSchema,
  createInternalNoteSchema,
  createTicketMessageSchema,
  createTicketSchema,
  sendAiMessageSchema,
  updateArticleSchema,
  updateTicketSchema,
} from './support.schema.js';
import { supportService } from './support.service.js';

// ── Legal Document Handler ───────────────────────────────────────────────────

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
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ── Categories & Knowledge Articles (Public/Patient) ─────────────────────────

export const getCategories = (_req: Request, res: Response) => {
  try {
    const categories = supportService.getCategories();
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

export const getArticles = async (req: Request, res: Response) => {
  try {
    const category = req.query['category'] as string | undefined;
    const query = (req.query['q'] || req.query['search']) as string | undefined;
    const articles = await supportService.getPublishedArticles(category, query);
    res.json({ articles, total: articles.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
};

export const getArticleDetail = async (req: Request, res: Response) => {
  try {
    const article = await supportService.getArticleDetail(paramId(req));
    res.json(article);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Article not found' });
  }
};

export const submitArticleFeedback = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    const parsed = articleFeedbackSchema.parse(req.body);
    const isHelpful = parsed.isHelpful !== undefined ? parsed.isHelpful : Boolean(parsed.helpful);
    const counts = await supportService.submitArticleFeedback(paramId(req), userId, isHelpful);
    res.json({ success: true, ...counts });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Invalid feedback request' });
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


// ── Patient Tickets ──────────────────────────────────────────────────────────

export const getSupportTickets = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const tickets = await supportService.getPatientTickets(userId);
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createSupportTicket = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    const userType = req.user?.role || req.body?.userType || 'patient';
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = createTicketSchema.parse(req.body);
    const ticket = await supportService.createTicket(userId, userType, data);
    res.status(201).json(ticket);
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Failed to create support ticket' });
  }
};

export const getPatientTicketDetails = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    const details = await supportService.getPatientTicketDetails(paramId(req), userId);
    res.json(details);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch ticket' });
  }
};

export const createPatientTicketMessage = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    const parsed = createTicketMessageSchema.parse(req.body);
    const msg = await supportService.addPatientMessage(paramId(req), userId, parsed.message);
    res.status(201).json(msg);
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Failed to post message' });
  }
};

export const reopenTicket = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    const ticket = await supportService.reopenTicket(paramId(req), userId);
    res.json(ticket);
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Failed to reopen ticket' });
  }
};

// ── AI Conversation Endpoints (Patient) ──────────────────────────────────────

export const createAiConversation = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    const parsed = createAiConversationSchema.parse(req.body);
    const conversation = await supportService.startAiConversation(
      userId,
      parsed.contextType,
      parsed.contextEntityId,
    );
    res.status(201).json({ conversationId: conversation.id, ...conversation });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Failed to start conversation' });
  }
};

export const getAiConversation = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    const conv = await supportService.getAiConversation(paramId(req), userId);
    res.json(conv);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch conversation' });
  }
};

export const sendAiMessage = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    const parsed = sendAiMessageSchema.parse(req.body);
    const reply = await supportService.sendAiMessage(userId, paramId(req), parsed.message);
    res.json(reply);
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Failed to process AI message' });
  }
};

// ── Agents Listing (Admin & Assignment) ───────────────────────────────────────

export const getActiveAgents = async (_req: Request, res: Response) => {
  try {
    const agents = await supportService.getActiveAgents();
    res.json({ agents });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch support agents' });
  }
};

// ── Admin Support Workspace Endpoints ────────────────────────────────────────

export const getAdminMetrics = async (_req: Request, res: Response) => {
  try {
    const metrics = await supportService.getAdminMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch support metrics' });
  }
};

export const getAdminTickets = async (req: Request, res: Response) => {
  try {
    const filters = {
      status: req.query['status'] as string | undefined,
      category: req.query['category'] as string | undefined,
      priority: req.query['priority'] as string | undefined,
      assignedTo: req.query['assignedTo'] as string | undefined,
      search: (req.query['search'] || req.query['q']) as string | undefined,
      page: req.query['page'] ? parseInt(req.query['page'] as string, 10) : undefined,
      limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined,
    };
    const result = await supportService.getAdminTickets(filters);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch admin tickets' });
  }
};

export const getAdminTicketDetails = async (req: Request, res: Response) => {
  try {
    const details = await supportService.getAdminTicketDetails(paramId(req));
    res.json(details);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Ticket not found' });
  }
};

export const updateTicketProperties = async (req: Request, res: Response) => {
  try {
    const adminId = req.user?.id || 'admin';
    const parsed = updateTicketSchema.parse(req.body);
    const updated = await supportService.updateTicketProperties(paramId(req), adminId, parsed);
    res.json(updated);
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Failed to update ticket' });
  }
};

export const assignTicket = async (req: Request, res: Response) => {
  try {
    const adminId = req.user?.id || 'admin';
    const parsed = assignTicketSchema.parse(req.body);
    const targetAgentId = parsed.assignedTo !== undefined ? parsed.assignedTo : parsed.agentId || null;
    const updated = await supportService.assignTicket(paramId(req), adminId, targetAgentId);
    res.json(updated);
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Failed to assign ticket' });
  }
};

export const addAdminReply = async (req: Request, res: Response) => {
  try {
    const adminId = req.user?.id || 'admin';
    const adminName = req.user?.email || 'Support Agent';
    const parsed = createTicketMessageSchema.parse(req.body);
    const msg = await supportService.addAdminReply(
      paramId(req),
      adminId,
      adminName,
      parsed.message,
      parsed.statusChange,
    );
    res.status(201).json(msg);
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Failed to send admin reply' });
  }
};

export const addInternalNote = async (req: Request, res: Response) => {
  try {
    const adminId = req.user?.id || 'admin';
    const adminName = req.user?.email || 'Staff Member';
    const parsed = createInternalNoteSchema.parse(req.body);
    const noteContent = parsed.note || parsed.message || '';
    const note = await supportService.addInternalNote(paramId(req), adminId, adminName, noteContent);
    res.status(201).json(note);
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Failed to add internal note' });
  }
};

export const generateAiSummary = async (req: Request, res: Response) => {
  try {
    const summary = await supportService.generateAiSummary(paramId(req));
    res.json(summary);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to generate AI summary' });
  }
};

// ── Admin Knowledge Base CMS ─────────────────────────────────────────────────

export const getAdminArticles = async (_req: Request, res: Response) => {
  try {
    const articles = await supportService.getAllArticlesAdmin();
    res.json({ articles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch admin articles' });
  }
};

export const createAdminArticle = async (req: Request, res: Response) => {
  try {
    const adminId = req.user?.id || 'admin';
    const parsed = createArticleSchema.parse(req.body);
    const article = await supportService.createArticle(adminId, { ...parsed, slug: parsed.slug || undefined });
    res.status(201).json(article);
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Failed to create article' });
  }
};

export const updateAdminArticle = async (req: Request, res: Response) => {
  try {
    const adminId = req.user?.id || 'admin';
    const parsed = updateArticleSchema.parse(req.body);
    const article = await supportService.updateArticle(adminId, paramId(req), parsed);
    res.json(article);
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Failed to update article' });
  }
};

export const deleteAdminArticle = async (req: Request, res: Response) => {
  try {
    const result = await supportService.deleteArticle(paramId(req));
    res.json(result);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete article' });
  }
};
