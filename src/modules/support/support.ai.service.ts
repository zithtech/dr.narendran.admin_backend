import { GoogleGenerativeAI } from '@google/generative-ai';

import { env } from '@/config/env.js';
import { logger } from '@/lib/logger.js';
import { getAppointmentById } from '@/modules/appointments/appointments.repository.js';

import { supportRepository } from './support.repository.js';
import type { SupportKnowledgeArticle } from './support.types.js';

const PRIMARY_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-flash-latest';

export interface AIResponse {
  answer: string;
  suggestedQuestions: string[];
  suggestedActions: {
    id: string;
    title: string;
    type: 'NAVIGATE' | 'CREATE_TICKET' | 'OPEN_DIALER';
    payload?: Record<string, unknown>;
  }[];
  relatedArticles: { id: string; title: string; slug: string }[];
  requiresHumanSupport: boolean;
  suggestedCategory?: string;
}

export class SupportAIService {
  private geminiUnavailableUntil = 0;

  private getApiKey(): string | null {
    return (
      env.GEMINI_API_KEY ||
      process.env['GEMINI_API_KEY'] ||
      process.env['AI_API_KEY'] ||
      null
    );
  }

  /**
   * Sanitizes and authorizes contextual records to ensure strict PHI minimization.
   */
  async getSanitizedContext(
    userId: string,
    contextType?: string | null,
    contextEntityId?: string | null,
  ): Promise<string | null> {
    if (!contextType || !contextEntityId) return null;

    try {
      if (contextType === 'APPOINTMENT') {
        const appt = await getAppointmentById(contextEntityId, userId);
        // Verify appointment exists
        if (appt) {
          return `Linked Appointment Reference: Token #${appt.tokenNumber}, Start ${appt.scheduledStart}, Status ${appt.status}. (No clinical records).`;
        }
      }
    } catch (err) {
      logger.warn({ err, contextType, contextEntityId }, 'Could not retrieve context entity');
    }
    return null;
  }

  async processPatientMessage(
    userId: string,
    userMessage: string,
    contextType?: string | null,
    contextEntityId?: string | null,
  ): Promise<AIResponse> {
    const trimmed = userMessage.trim();

    // 1. Emergency Safety Check: Immediate interception
    const emergencyRegex = /\b(chest pain|heart attack|cannot breathe|shortness of breath|severe bleeding|unconscious|poison|overdose|emergency)\b/i;
    if (emergencyRegex.test(trimmed)) {
      return {
        answer:
          '🚨 EMERGENCY ALERT: If you or someone with you is experiencing a medical emergency, please immediately call our 24/7 Clinic Emergency Helpline at +91 94432 23456 or go to the nearest hospital emergency room. AI Assistant cannot provide emergency medical triage.',
        suggestedQuestions: ['Call Clinic Emergency Hotline', 'Clinic Address & Location'],
        suggestedActions: [
          { id: 'act-dialer', title: 'Call Emergency Helpline', type: 'OPEN_DIALER', payload: { phone: '+919443223456' } },
        ],
        relatedArticles: [],
        requiresHumanSupport: true,
      };
    }

    // 2. Retrieve relevant published articles for grounding
    const articles = await supportRepository.listPublishedArticles(undefined, trimmed);
    const topArticles = articles.slice(0, 4);

    // 3. Retrieve sanitized context
    const sanitizedContext = await this.getSanitizedContext(userId, contextType, contextEntityId);

    // 4. Try AI generation if API key is present and circuit is closed
    const apiKey = this.getApiKey();
    if (apiKey && Date.now() > this.geminiUnavailableUntil) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: PRIMARY_MODEL });

        const prompt = this.buildPrompt(trimmed, topArticles, sanitizedContext);
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        const parsed = this.parseModelResponse(text, topArticles);
        if (parsed) {
          return parsed;
        }
      } catch (err: any) {
        const isAuthOrQuota =
          err?.status === 403 ||
          err?.status === 401 ||
          err?.message?.includes('403') ||
          err?.message?.includes('free tier is not available') ||
          err?.message?.includes('API_KEY_INVALID');

        if (isAuthOrQuota) {
          this.geminiUnavailableUntil = Date.now() + 5 * 60 * 1000;
          logger.warn(
            'Gemini API is unavailable for this project (billing required at https://aistudio.google.com/billing); seamlessly using rule-based clinic knowledge engine.',
          );
        } else {
          logger.warn({ err }, 'Gemini support assistant failed; trying fallback model');
          try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: FALLBACK_MODEL });
            const prompt = this.buildPrompt(trimmed, topArticles, sanitizedContext);
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const parsed = this.parseModelResponse(text, topArticles);
            if (parsed) {
              return parsed;
            }
          } catch (fallbackErr) {
            logger.error({ fallbackErr }, 'Fallback Gemini model also failed; switching to rule-based fallback');
          }
        }
      }
    }

    // 5. Deterministic Offline / Fallback Engine
    return this.generateFallbackResponse(trimmed, topArticles);
  }

  private buildPrompt(
    userMessage: string,
    articles: SupportKnowledgeArticle[],
    sanitizedContext: string | null,
  ): string {
    const articleSnippets = articles
      .map(
        a =>
          `[Article Title: ${a.title} (Slug: ${a.slug})]\nCategory: ${a.category}\nContent: ${a.content}\n`,
      )
      .join('\n---\n');

    return `
You are the dedicated AI Patient Care Assistant for Dr. Narendran Hospital and Clinic.
Your objective is to provide warm, clear, professional, and accurate guidance regarding clinic appointments, prescriptions, pharmacy orders, billing, and app features.

STRICT MEDICAL SAFETY RULES:
1. NEVER diagnose symptoms or medical conditions.
2. NEVER prescribe medications or suggest altering drug dosages or schedules.
3. NEVER make speculative clinical conclusions.
4. If the user mentions physical symptoms or medical queries requiring doctor evaluation, advise them to book an appointment with Dr. Narendran.
5. Base all policy, rescheduling, and payment answers ONLY on the approved clinic articles provided below.
6. If the user explicitly asks for a human agent, or if you cannot answer with high confidence based on the articles, set "requiresHumanSupport": true.

APPROVED CLINIC KNOWLEDGE ARTICLES:
${articleSnippets || 'No specific articles found for this topic.'}

${sanitizedContext ? `AUTHENTICATED APP CONTEXT:\n${sanitizedContext}\n` : ''}

PATIENT INQUIRY:
"${userMessage}"

Respond ONLY with valid JSON conforming to this exact structure:
{
  "answer": "Clear, friendly, and helpful guidance for the patient",
  "suggestedQuestions": ["Follow-up question 1", "Follow-up question 2"],
  "requiresHumanSupport": false,
  "suggestedCategory": "APPOINTMENTS or PRESCRIPTIONS or PHARMACY_ORDERS or PAYMENTS_BILLING or GENERAL_QUERY"
}
`;
  }

  private parseModelResponse(
    rawText: string,
    articles: SupportKnowledgeArticle[],
  ): AIResponse | null {
    try {
      const cleaned = rawText
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const parsed = JSON.parse(cleaned);

      return {
        answer: parsed.answer || 'How else can I assist you with Dr. Narendran Clinic services today?',
        suggestedQuestions: Array.isArray(parsed.suggestedQuestions)
          ? parsed.suggestedQuestions.slice(0, 3)
          : ['How do I reschedule?', 'Where is my prescription?'],
        suggestedActions: parsed.requiresHumanSupport
          ? [
            {
              id: 'act-ticket',
              title: 'Create Support Ticket',
              type: 'CREATE_TICKET',
              payload: { category: parsed.suggestedCategory || 'GENERAL_QUERY' },
            },
          ]
          : [],
        relatedArticles: articles.slice(0, 2).map(a => ({
          id: a.id,
          title: a.title,
          slug: a.slug,
        })),
        requiresHumanSupport: Boolean(parsed.requiresHumanSupport),
        suggestedCategory: parsed.suggestedCategory,
      };
    } catch {
      return null;
    }
  }

  private generateFallbackResponse(
    userMessage: string,
    articles: SupportKnowledgeArticle[],
  ): AIResponse {
    const text = userMessage.toLowerCase();

    // Check human escalation intent
    if (
      text.includes('human') ||
      text.includes('agent') ||
      text.includes('support team') ||
      text.includes('talk to someone') ||
      text.includes('representative')
    ) {
      return {
        answer:
          "I can certainly connect you with our hospital support team. Would you like me to open a support ticket for you right away?",
        suggestedQuestions: ['Create a support ticket', 'Call clinic reception'],
        suggestedActions: [
          { id: 'act-ticket', title: 'Create Support Ticket', type: 'CREATE_TICKET', payload: { category: 'GENERAL_QUERY' } },
        ],
        relatedArticles: [],
        requiresHumanSupport: true,
      };
    }

    // Appointment intent
    if (text.includes('reschedule') || text.includes('appointment') || text.includes('cancel')) {
      const matched = articles.find(a => a.category === 'APPOINTMENTS') || articles[0];
      return {
        answer: matched
          ? matched.content
          : 'You can manage and reschedule your consultations in the Appointments tab up to 2 hours before the scheduled time slot.',
        suggestedQuestions: ['What is the cancellation policy?', 'How do I book a follow-up?'],
        suggestedActions: [],
        relatedArticles: articles.slice(0, 2).map(a => ({ id: a.id, title: a.title, slug: a.slug })),
        requiresHumanSupport: false,
        suggestedCategory: 'APPOINTMENTS',
      };
    }

    // Prescription & medicine orders
    if (text.includes('prescription') || text.includes('medicine') || text.includes('pharmacy')) {
      const matched =
        articles.find(a => a.category === 'PRESCRIPTIONS' || a.category === 'PHARMACY_ORDERS') ||
        articles[0];
      return {
        answer: matched
          ? matched.content
          : 'Your digital prescriptions are available in the Prescriptions tab. You can order prescribed medicines directly for clinic pickup or home delivery.',
        suggestedQuestions: ['How do I track medicine delivery?', 'Can I download prescription PDF?'],
        suggestedActions: [],
        relatedArticles: articles.slice(0, 2).map(a => ({ id: a.id, title: a.title, slug: a.slug })),
        requiresHumanSupport: false,
        suggestedCategory: 'PHARMACY_ORDERS',
      };
    }

    // General fallback
    return {
      answer: articles.length > 0
        ? `Here is information that might help you:\n\n${articles[0]!.content}`
        : "Hello! I am your AI Patient Assistant. I can help you with appointments, digital prescriptions, pharmacy orders, and clinic policies. How can I assist you today?",
      suggestedQuestions: [
        'How do I reschedule my appointment?',
        'How do I order medicines?',
        'Talk to support team',
      ],
      suggestedActions: [],
      relatedArticles: articles.slice(0, 2).map(a => ({ id: a.id, title: a.title, slug: a.slug })),
      requiresHumanSupport: false,
    };
  }

  /**
   * Generates a concise incident summary for administrative support staff.
   */
  async generateTicketSummary(
    ticketSubject: string,
    ticketMessage: string,
    aiMessages: { sender_type: string; message: string }[],
  ): Promise<{
    problemSummary: string;
    troubleshootingAttempted: string;
    suggestedNextSteps: string;
  }> {
    const apiKey = this.getApiKey();
    if (apiKey && Date.now() > this.geminiUnavailableUntil) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: PRIMARY_MODEL });

        const dialogue = aiMessages
          .map(m => `${m.sender_type}: ${m.message}`)
          .join('\n');

        const prompt = `
Summarize this patient support ticket for clinic administrative staff.
Ticket Subject: "${ticketSubject}"
Ticket Description: "${ticketMessage}"
Pre-escalation AI Conversation:
${dialogue || 'No preceding chat.'}

Return JSON with:
{
  "problemSummary": "1-2 sentence description of patient core issue",
  "troubleshootingAttempted": "What AI recommended or user tried",
  "suggestedNextSteps": "Recommended administrative action"
}
`;
        const res = await model.generateContent(prompt);
        const text = res.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(text);
        return {
          problemSummary: parsed.problemSummary || ticketSubject,
          troubleshootingAttempted: parsed.troubleshootingAttempted || 'Patient reviewed automated FAQ guidance.',
          suggestedNextSteps: parsed.suggestedNextSteps || 'Contact patient via message composer or phone.',
        };
      } catch (err: any) {
        if (err?.status === 403 || err?.message?.includes('403')) {
          this.geminiUnavailableUntil = Date.now() + 5 * 60 * 1000;
        }
        logger.warn({ err: err?.message || err }, 'Could not generate AI ticket summary with Gemini; using rule-based summary');
      }
    }

    return {
      problemSummary: `${ticketSubject}: ${ticketMessage.slice(0, 160)}`,
      troubleshootingAttempted: aiMessages.length > 0 ? `Patient had ${aiMessages.length} interaction(s) with AI chatbot.` : 'Direct ticket creation.',
      suggestedNextSteps: 'Review patient details, assign an agent, and reply to the ticket.',
    };
  }
}

export const supportAIService = new SupportAIService();
