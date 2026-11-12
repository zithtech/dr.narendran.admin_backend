import { Router } from 'express';

import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';

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
const supportSlugs = ['PATIENT_SUPPORT', 'DOCTOR_SUPPORT', 'SUPPORT'];
adminSupportRouter.use(requireAuth);

adminSupportRouter.get('/metrics', requirePermission('PATIENT_SUPPORT', 'read', supportSlugs), getAdminMetrics);
adminSupportRouter.get('/agents', requirePermission('PATIENT_SUPPORT', 'read', supportSlugs), getActiveAgents);
adminSupportRouter.get('/tickets', requirePermission('PATIENT_SUPPORT', 'read', supportSlugs), getAdminTickets);
adminSupportRouter.get('/tickets/:id', requirePermission('PATIENT_SUPPORT', 'read', supportSlugs), getAdminTicketDetails);
adminSupportRouter.patch('/tickets/:id', requirePermission('PATIENT_SUPPORT', 'update', supportSlugs), updateTicketProperties);
adminSupportRouter.post('/tickets/:id/assign', requirePermission('PATIENT_SUPPORT', 'update', supportSlugs), assignTicket);
adminSupportRouter.post('/tickets/:id/messages', requirePermission('PATIENT_SUPPORT', 'update', supportSlugs), addAdminReply);
adminSupportRouter.post('/tickets/:id/internal-notes', requirePermission('PATIENT_SUPPORT', 'update', supportSlugs), addInternalNote);
adminSupportRouter.post('/tickets/:id/ai-summary', requirePermission('PATIENT_SUPPORT', 'update', supportSlugs), generateAiSummary);

adminSupportRouter.get('/articles', requirePermission('PATIENT_SUPPORT', 'read', supportSlugs), getAdminArticles);
adminSupportRouter.post('/articles', requirePermission('PATIENT_SUPPORT', 'create', supportSlugs), createAdminArticle);
adminSupportRouter.put('/articles/:id', requirePermission('PATIENT_SUPPORT', 'update', supportSlugs), updateAdminArticle);
adminSupportRouter.delete('/articles/:id', requirePermission('PATIENT_SUPPORT', 'delete', supportSlugs), deleteAdminArticle);

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
