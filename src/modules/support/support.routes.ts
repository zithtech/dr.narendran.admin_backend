import { Router } from 'express';

import { requireAuth, requireRole } from '@/http/middleware/authenticate.js';

import {
  addAdminReply,
  addInternalNote,
  assignTicket,
  createAdminArticle,
  createAiConversation,
  createPatientTicketMessage,
  createSupportTicket,
  deleteAdminArticle,
  generateAiSummary,
  getActiveAgents,
  getAdminArticles,
  getAdminMetrics,
  getAdminTicketDetails,
  getAdminTickets,
  getArticleDetail,
  getArticles,
  getCategories,
  getLegalDocument,
  getPatientTicketDetails,
  getSupportTickets,
  reopenTicket,
  sendAiMessage,
  submitArticleFeedback,
  updateAdminArticle,
  updateTicketProperties,
  getAboutInfo,
  getContactInfo,
  getFAQs,
  getPrivacyRequests,
  getSystemLinks,
  getUserPreferences,
  raisePrivacyConcern,
  requestDataErasure,
  requestDataExport,
  resetUserPreferences,
  saveUserPreferences,
} from './support.controller.js';

export const supportRouter: Router = Router();
export const adminSupportRouter: Router = Router();

// ── Public / Common ──────────────────────────────────────────────────────────
supportRouter.get('/legal', getLegalDocument);
supportRouter.get('/categories', getCategories);
supportRouter.get('/articles', getArticles);
supportRouter.get('/articles/:id', getArticleDetail);

// ── Patient Endpoints ────────────────────────────────────────────────────────
supportRouter.post('/articles/:id/feedback', requireAuth, submitArticleFeedback);

supportRouter.post('/ai/conversations', requireAuth, createAiConversation);
supportRouter.post('/ai/conversations/:id/messages', requireAuth, sendAiMessage);

supportRouter.get('/tickets', requireAuth, getSupportTickets);
supportRouter.post('/tickets', requireAuth, createSupportTicket);
supportRouter.get('/tickets/:id', requireAuth, getPatientTicketDetails);
supportRouter.post('/tickets/:id/messages', requireAuth, createPatientTicketMessage);
supportRouter.post('/tickets/:id/reopen', requireAuth, reopenTicket);

// Eligible support agents listing (admin_users)
supportRouter.get('/agents', requireAuth, getActiveAgents);

// ── Admin Endpoints (Mounted under /api/admin/support AND /api/support/admin) ──
adminSupportRouter.use(requireAuth, requireRole('admin'));

adminSupportRouter.get('/metrics', getAdminMetrics);
adminSupportRouter.get('/agents', getActiveAgents);
adminSupportRouter.get('/tickets', getAdminTickets);
adminSupportRouter.get('/tickets/:id', getAdminTicketDetails);
adminSupportRouter.patch('/tickets/:id', updateTicketProperties);
adminSupportRouter.post('/tickets/:id/assign', assignTicket);
adminSupportRouter.post('/tickets/:id/messages', addAdminReply);
adminSupportRouter.post('/tickets/:id/internal-notes', addInternalNote);
adminSupportRouter.post('/tickets/:id/ai-summary', generateAiSummary);

adminSupportRouter.get('/articles', getAdminArticles);
adminSupportRouter.post('/articles', createAdminArticle);
adminSupportRouter.put('/articles/:id', updateAdminArticle);
adminSupportRouter.delete('/articles/:id', deleteAdminArticle);

// Also mount under supportRouter.use('/admin', adminSupportRouter) for /api/support/admin/* routes
supportRouter.use('/admin', adminSupportRouter);
// -------
// Public metadata & information routes
supportRouter.get('/faqs', getFAQs);
supportRouter.get('/contact-info', getContactInfo);
supportRouter.get('/about', getAboutInfo);
supportRouter.get('/system-links', getSystemLinks);
supportRouter.get('/legal', getLegalDocument);

// Support tickets routes (authenticated)
// supportRouter.get('/tickets', requireAuth, getSupportTickets);
// supportRouter.get('/tickets/:id', requireAuth, getSupportTicketById);
// supportRouter.post('/tickets', requireAuth, createSupportTicket);
// supportRouter.patch('/tickets/:id/status', requireAuth, updateSupportTicketStatus);

// App preferences & configuration routes (authenticated)
supportRouter.get('/preferences', requireAuth, getUserPreferences);
supportRouter.put('/preferences', requireAuth, saveUserPreferences);
supportRouter.post('/preferences/reset', requireAuth, resetUserPreferences);

// Privacy, concerns & data management routes (authenticated)
supportRouter.post('/privacy-concern', requireAuth, raisePrivacyConcern);
supportRouter.post('/data-export', requireAuth, requestDataExport);
supportRouter.post('/data-erasure', requireAuth, requestDataErasure);
supportRouter.get('/privacy-requests', requireAuth, getPrivacyRequests);

export default supportRouter;
