import { pool } from '@/db/pool.js';

export interface FAQItem {
  id: string;
  category: 'appointments' | 'availability' | 'prescriptions' | 'chat' | 'general';
  question: string;
  answer: string;
}

export interface ContactInfo {
  email: string;
  phone: string;
  emergencyPhone: string;
  whatsapp: string;
  address: string;
  operatingHours: string;
  responseTime: string;
  googleMapsUrl: string;
}

export interface AboutInfo {
  appName: string;
  portalName: string;
  version: string;
  build: string;
  releaseDate: string;
  environment: string;
  provider: {
    facilityName: string;
    leadConsultant: string;
    registrationNumber: string;
    accreditations: string[];
    address: string;
    officialPortalUrl: string;
  };
  compliance: {
    standards: string[];
    dpoContact: string;
    medicalRetentionPeriod: string;
  };
  licenses: Array<{ name: string; license: string }>;
}

export interface ExternalLinkInfo {
  id: string;
  title: string;
  url: string;
  category: 'portal' | 'support' | 'legal' | 'maps';
  description: string;
}

const DEFAULT_FAQS: FAQItem[] = [
  {
    id: 'faq-1',
    category: 'appointments',
    question: 'How do I reschedule an appointment?',
    answer:
      'Go to your appointments list, tap on an upcoming appointment, and select Reschedule. You can then pick a new date and time slot for the patient.',
  },
  {
    id: 'faq-2',
    category: 'availability',
    question: 'How do I change my location availability?',
    answer:
      'Open your Profile or Schedule screen and tap Availability. From there, you can configure working hours, break times, and toggle active days for each clinic location.',
  },
  {
    id: 'faq-3',
    category: 'chat',
    question: 'How can I contact a patient directly?',
    answer:
      'You can use the Chat tab in the bottom navigation bar to message your booked patients directly, or tap their phone number on the appointment details screen.',
  },
  {
    id: 'faq-4',
    category: 'prescriptions',
    question: 'How do I issue an e-prescription?',
    answer:
      'During or after a consultation, open the appointment card and tap "Add Prescription". Enter the diagnosis, prescribed medicines, dosages, and instructions, then tap Save.',
  },
  {
    id: 'faq-5',
    category: 'appointments',
    question: 'How do I mark an appointment as complete?',
    answer:
      'On your Schedule screen, locate the patient card and tap "Complete Consultation". You can optionally attach consultation notes.',
  },
  {
    id: 'faq-6',
    category: 'availability',
    question: 'What happens if I need to block a specific date or holiday?',
    answer:
      'Under Availability > Blocked Dates, tap "+ Add Blocked Date" to mark specific days off. Patients will not be able to book appointments during blocked periods.',
  },
  {
    id: 'faq-7',
    category: 'general',
    question: 'How do I report an issue or bug in the app?',
    answer:
      'Go to Help & Support > Report an Issue, enter the subject and describe the issue in detail. A support ticket will automatically be created.',
  },
];

export class SupportService {
  getFAQs(category?: string): FAQItem[] {
    if (category) {
      return DEFAULT_FAQS.filter(
        faq => faq.category.toLowerCase() === category.toLowerCase(),
      );
    }
    return DEFAULT_FAQS;
  }

  getContactInfo(): ContactInfo {
    return {
      email: 'support@drnarendran.com',
      phone: '+91 91509 55655',
      emergencyPhone: '+91 91509 55655',
      whatsapp: '+919150955655',
      address: '124, 4th Avenue, Shanthi Colony, Anna Nagar, Chennai - 600040',
      operatingHours: '24/7 Round-the-Clock Support',
      responseTime: 'Under 15 minutes for clinical queries',
      googleMapsUrl:
        'https://www.google.com/maps/search/?api=1&query=Dr.+Narendran+Healthcare+Centre+Anna+Nagar+Chennai',
    };
  }

  getAboutInfo(): AboutInfo {
    return {
      appName: 'Dr. Narendran HMS',
      portalName: 'Doctor Portal',
      version: '1.0.0',
      build: '2026.10.22',
      releaseDate: 'October 2026',
      environment: process.env['NODE_ENV'] || 'development',
      provider: {
        facilityName: 'Dr. Narendran Super Speciality Healthcare Centre',
        leadConsultant: 'Dr. Narendran MBBS, MD (General Medicine)',
        registrationNumber: 'TN-MCI-2018-84920',
        accreditations: [
          'NABH Accredited Hospital',
          'ISO 9001:2015 Quality Management Certified',
        ],
        address: '124, 4th Avenue, Shanthi Colony, Anna Nagar, Chennai - 600040',
        officialPortalUrl: 'https://drnarendran.com',
      },
      compliance: {
        standards: ['DISHA', 'ABDM', 'HIPAA Clinical Security', 'NMC Guidelines'],
        dpoContact: 'dpo@drnarendran.com',
        medicalRetentionPeriod: '3 years minimum statutory retention for clinical notes',
      },
      licenses: [
        { name: 'React Native', license: 'MIT License (Meta Platforms, Inc.)' },
        { name: 'Express.js', license: 'MIT License' },
        { name: 'PostgreSQL', license: 'PostgreSQL License' },
        { name: 'Socket.IO', license: 'MIT License' },
        { name: 'Zod & TypeScript', license: 'MIT License' },
      ],
    };
  }

  getSystemLinks(): ExternalLinkInfo[] {
    return [
      {
        id: 'portal',
        title: 'Official Healthcare Portal',
        url: 'https://drnarendran.com',
        category: 'portal',
        description: 'Web portal for hospital operations, consultations, and records',
      },
      {
        id: 'maps',
        title: 'Hospital Navigation (Google Maps)',
        url: 'https://www.google.com/maps/search/?api=1&query=Dr.+Narendran+Healthcare+Centre+Anna+Nagar+Chennai',
        category: 'maps',
        description: 'Physical location of Dr. Narendran Healthcare Centre in Anna Nagar, Chennai',
      },
      {
        id: 'whatsapp',
        title: 'Instant WhatsApp Desk',
        url: 'https://api.whatsapp.com/send?phone=919150955655',
        category: 'support',
        description: 'Direct messaging coordination desk with hospital staff',
      },
      {
        id: 'privacy',
        title: 'Privacy and Data Protection Policy',
        url: 'https://drnarendran.com/privacy',
        category: 'legal',
        description: 'Healthcare compliance and patient data privacy documentation',
      },
      {
        id: 'terms',
        title: 'Clinical Terms of Service',
        url: 'https://drnarendran.com/terms',
        category: 'legal',
        description: 'Terms governing medical consultation and portal usage',
      },
    ];
  }

  /* ---------------- User App Preferences ---------------- */

  async getUserPreferences(userId: string): Promise<Record<string, any>> {
    const { rows } = await pool.query(
      'SELECT preferences FROM user_preferences WHERE user_id = $1',
      [userId],
    );
    return rows[0]?.preferences || {};
  }

  async saveUserPreferences(
    userId: string,
    preferences: Record<string, any>,
  ): Promise<Record<string, any>> {
    const { rows } = await pool.query(
      `INSERT INTO user_preferences (user_id, preferences, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET preferences = $2, updated_at = NOW()
       RETURNING preferences`,
      [userId, JSON.stringify(preferences)],
    );
    return rows[0]?.preferences || {};
  }

  async resetUserPreferences(userId: string): Promise<Record<string, any>> {
    await pool.query('DELETE FROM user_preferences WHERE user_id = $1', [userId]);
    return {};
  }

  /* ---------------- Privacy & Data Concerns ---------------- */

  async raisePrivacyConcern(
    userId: string,
    userType: string,
    category: string,
    details: string,
    subject?: string,
  ) {
    const trackingId = `DPO-${Math.floor(100000 + Math.random() * 900000)}`;
    const finalSubject = subject || `[PRIVACY_CONCERN] ${category}`;

    // 1. Record in privacy_requests
    const { rows: privacyRows } = await pool.query(
      `INSERT INTO privacy_requests (request_id, user_id, user_type, request_type, category, subject, details, status)
       VALUES ($1, $2, $3, 'PRIVACY_CONCERN', $4, $5, $6, 'IN_REVIEW')
       RETURNING *`,
      [trackingId, userId, userType, category, finalSubject, details],
    );

    // 2. Also create a linked high-priority support ticket
    await pool.query(
      `INSERT INTO support_tickets (user_id, user_type, subject, message, status)
       VALUES ($1, $2, $3, $4, 'OPEN')`,
      [
        userId,
        userType,
        `[PRIORITY: HIGH] ${finalSubject} (${trackingId})`,
        `Incident Category: ${category}\nTracking ID: ${trackingId}\n\nIncident Details:\n${details}`,
      ],
    );

    return {
      trackingId,
      request: privacyRows[0],
      message: 'Your privacy concern has been officially logged with the Hospital Data Protection Officer.',
    };
  }

  async requestDataExport(
    userId: string,
    userType: string,
    format: string = 'PDF',
    details?: string,
  ) {
    const trackingId = `EXP-${Math.floor(100000 + Math.random() * 900000)}`;

    const { rows } = await pool.query(
      `INSERT INTO privacy_requests (request_id, user_id, user_type, request_type, format, details, status)
       VALUES ($1, $2, $3, 'DATA_EXPORT', $4, $5, 'PROCESSING')
       RETURNING *`,
      [
        trackingId,
        userId,
        userType,
        format.toUpperCase(),
        details || `Export request for clinical notes, appointments and audit history in ${format.toUpperCase()}`,
      ],
    );

    return {
      trackingId,
      request: rows[0],
      estimatedHours: 2,
      message: `Your clinical data export (${format.toUpperCase()}) has been queued. A secure archive link will be delivered within 2-4 hours.`,
    };
  }

  async requestDataErasure(userId: string, userType: string, reason?: string) {
    const trackingId = `DEL-${Math.floor(100000 + Math.random() * 900000)}`;

    const { rows } = await pool.query(
      `INSERT INTO privacy_requests (request_id, user_id, user_type, request_type, details, status)
       VALUES ($1, $2, $3, 'DATA_ERASURE', $4, 'IN_REVIEW')
       RETURNING *`,
      [
        trackingId,
        userId,
        userType,
        reason || 'Request for account decommissioning and erasure of non-statutory records',
      ],
    );

    return {
      trackingId,
      request: rows[0],
      statutoryNote:
        'Clinical consultation records and audit trails are preserved for statutory minimum durations (3 years) as mandated by NMC and ABDM regulations.',
      message: 'Account erasure request submitted. An identity confirmation verification will occur before archival.',
    };
  }

  async getPrivacyRequests(userId: string) {
    const { rows } = await pool.query(
      'SELECT * FROM privacy_requests WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return rows;
  }

  /* ---------------- Support Tickets & Legal ---------------- */

  async getSupportTickets(userId: string) {
    const { rows } = await pool.query(
      'SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return rows;
  }

  async getSupportTicketById(ticketId: string, userId?: string) {
    const query = userId
      ? 'SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM support_tickets WHERE id = $1';
    const params = userId ? [ticketId, userId] : [ticketId];
    const { rows } = await pool.query(query, params);
    return rows[0] || null;
  }

  async getLegalDocument(type: 'TERMS' | 'PRIVACY') {
    const { rows } = await pool.query(
      'SELECT content FROM legal_documents WHERE type = $1',
      [type],
    );
    return rows[0] || null;
  }

  async updateLegalDocument(type: 'TERMS' | 'PRIVACY', content: string) {
    const { rows } = await pool.query(
      `INSERT INTO legal_documents (type, content) 
       VALUES ($1, $2)
       ON CONFLICT (type) DO UPDATE SET content = $2, updated_at = NOW()
       RETURNING *`,
      [type, content],
    );
    return rows[0];
  }

  async createSupportTicket(
    userId: string,
    userType: string,
    subject: string,
    message: string,
  ) {
    const { rows } = await pool.query(
      `INSERT INTO support_tickets (user_id, user_type, subject, message)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, userType, subject, message],
    );
    return rows[0];
  }

  async updateSupportTicketStatus(ticketId: string, status: string) {
    const { rows } = await pool.query(
      `UPDATE support_tickets 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [status.toUpperCase(), ticketId],
    );
    return rows[0] || null;
  }
}

export const supportService = new SupportService();
