import { z } from 'zod';

export const createTicketSchema = z.object({
  subject: z.string().trim().min(2, 'Subject must be at least 2 characters').max(255),
  message: z.string().trim().min(2, 'Message must be at least 2 characters').max(5000).optional(),
  description: z.string().trim().min(2).max(5000).optional(),
  category: z.string().trim().max(100).default('GENERAL_QUERY'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  relatedEntityType: z.string().trim().max(50).nullable().optional(),
  relatedEntityId: z.string().trim().max(100).nullable().optional(),
  aiConversationId: z.string().uuid().nullable().optional(),
}).refine(data => data.message || data.description, {
  message: 'Message or description is required',
  path: ['message'],
});

export const createTicketMessageSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(5000),
  statusChange: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_PATIENT', 'RESOLVED', 'CLOSED']).optional(),
});

export const updateTicketSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_PATIENT', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  category: z.string().trim().max(100).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  resolutionNotes: z.string().trim().max(5000).nullable().optional(),
});

export const assignTicketSchema = z.object({
  assignedTo: z.string().uuid().nullable().optional(),
  agentId: z.string().uuid().nullable().optional(),
}).refine(data => data.assignedTo !== undefined || data.agentId !== undefined, {
  message: 'assignedTo or agentId is required',
});

export const createInternalNoteSchema = z.object({
  note: z.string().trim().min(1, 'Note cannot be empty').max(5000).optional(),
  message: z.string().trim().min(1).max(5000).optional(),
}).refine(data => data.note || data.message, {
  message: 'Note content is required',
  path: ['note'],
});

export const createAiConversationSchema = z.object({
  contextType: z.string().trim().max(50).nullable().optional(),
  contextEntityId: z.string().trim().max(100).nullable().optional(),
});

export const sendAiMessageSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(2000),
});

export const articleFeedbackSchema = z.object({
  helpful: z.boolean().optional(),
  isHelpful: z.boolean().optional(),
}).refine(data => data.helpful !== undefined || data.isHelpful !== undefined, {
  message: 'helpful or isHelpful boolean is required',
});

export const createArticleSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(255),
  slug: z.string().trim().max(255).optional(),
  category: z.string().trim().min(2).max(100),
  content: z.string().trim().min(5, 'Content must be at least 5 characters'),
  keywords: z.array(z.string().trim()).default([]),
  isFaq: z.boolean().default(false),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('PUBLISHED'),
});

export const updateArticleSchema = createArticleSchema.partial();
