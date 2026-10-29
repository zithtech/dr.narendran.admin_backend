import { Router } from 'express';

import { requireAuth } from '@/http/middleware/authenticate.js';

import {
  createSupportTicket,
  getAboutInfo,
  getContactInfo,
  getFAQs,
  getLegalDocument,
  getPrivacyRequests,
  getSupportTicketById,
  getSupportTickets,
  getSystemLinks,
  getUserPreferences,
  raisePrivacyConcern,
  requestDataErasure,
  requestDataExport,
  resetUserPreferences,
  saveUserPreferences,
  updateSupportTicketStatus,
} from './support.controller.js';

const router = Router();

// Public metadata & information routes
router.get('/faqs', getFAQs);
router.get('/contact-info', getContactInfo);
router.get('/about', getAboutInfo);
router.get('/system-links', getSystemLinks);
router.get('/legal', getLegalDocument);

// Support tickets routes (authenticated)
router.get('/tickets', requireAuth, getSupportTickets);
router.get('/tickets/:id', requireAuth, getSupportTicketById);
router.post('/tickets', requireAuth, createSupportTicket);
router.patch('/tickets/:id/status', requireAuth, updateSupportTicketStatus);

// App preferences & configuration routes (authenticated)
router.get('/preferences', requireAuth, getUserPreferences);
router.put('/preferences', requireAuth, saveUserPreferences);
router.post('/preferences/reset', requireAuth, resetUserPreferences);

// Privacy, concerns & data management routes (authenticated)
router.post('/privacy-concern', requireAuth, raisePrivacyConcern);
router.post('/data-export', requireAuth, requestDataExport);
router.post('/data-erasure', requireAuth, requestDataErasure);
router.get('/privacy-requests', requireAuth, getPrivacyRequests);

export default router;
