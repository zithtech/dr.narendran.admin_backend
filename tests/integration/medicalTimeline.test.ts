import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/users/users.repository.js');
vi.mock('@/modules/patients/medicalTimeline.repository.js');
vi.mock('@/modules/s3/s3.service.js');

import { buildApp } from '@/http/app.js';
import * as timelineRepo from '@/modules/patients/medicalTimeline.repository.js';
import { s3Service } from '@/modules/s3/s3.service.js';
import * as usersRepository from '@/modules/users/users.repository.js';

import {
  ALICE_ID,
  BOB_ID,
  bearer,
  makeAuthContext,
  tokenFor,
} from '../helpers/fixtures.js';

const app = buildApp();

function authAsAlice(): void {
  vi.mocked(usersRepository.findAuthContextById).mockResolvedValue(
    makeAuthContext({ id: ALICE_ID, role: 'patient' }),
  );
}

function authAsBob(): void {
  vi.mocked(usersRepository.findAuthContextById).mockResolvedValue(
    makeAuthContext({ id: BOB_ID, role: 'patient' }),
  );
}

const mockPatientProfile: timelineRepo.RawPatientRow = {
  id: ALICE_ID,
  userAccountId: ALICE_ID,
  name: 'BHARATHI M',
  phone: '+91 9876543210',
  email: 'bharathi@example.com',
  dateOfBirth: '1998-04-15',
  gender: 'Female',
  heightCm: 165,
  weightKg: 58,
  bloodGroup: 'B+',
  maritalStatus: 'Single',
  basicMedicalInfo: {
    allergies: ['Penicillin'],
    currentMedication: ['Tamoxifen 20mg'],
    pastMedication: [],
    injuries: [],
    surgeries: [],
  },
  emergencyContacts: [],
  profileImageUrl: null,
  createdAt: '2026-01-01T10:00:00.000Z',
};

const mockAppointments: timelineRepo.RawAppointmentRow[] = [
  {
    id: 'appt-001',
    patientId: ALICE_ID,
    doctorId: 'doc-001',
    doctorName: 'Dr. S. Narendran',
    doctorSpecialization: 'Consultant Oncologist',
    scheduledStart: '2026-10-06T11:00:00.000Z',
    scheduledEnd: '2026-10-06T11:30:00.000Z',
    status: 'completed',
    purpose: 'Follow-up Consultation',
    visitReason: 'Routine review',
    rescheduleReason: null,
    cancellationReason: null,
    consultationNotes: 'Patient responding well to therapy. Continue Tamoxifen.',
    diagnosis: 'Early stage breast carcinoma - on maintenance',
    vitals: { bp: '120/80', pulse: 72 },
    createdAt: '2026-10-01T09:00:00.000Z',
  },
  {
    id: 'appt-002',
    patientId: ALICE_ID,
    doctorId: 'doc-001',
    doctorName: 'Dr. S. Narendran',
    doctorSpecialization: 'Consultant Oncologist',
    scheduledStart: '2026-11-15T10:00:00.000Z',
    scheduledEnd: '2026-11-15T10:30:00.000Z',
    status: 'scheduled',
    purpose: 'Follow-up Review',
    visitReason: 'Next follow up',
    rescheduleReason: null,
    cancellationReason: null,
    consultationNotes: null,
    diagnosis: null,
    vitals: null,
    createdAt: '2026-10-06T11:30:00.000Z',
  },
];

const mockPrescriptions: timelineRepo.RawPrescriptionRow[] = [
  {
    id: 'presc-001',
    patientId: ALICE_ID,
    doctorId: 'doc-001',
    doctorName: 'Dr. S. Narendran',
    doctorSpecialization: 'Consultant Oncologist',
    appointmentId: 'appt-001',
    prescriptionDate: '2026-10-06',
    status: 'active',
    additionalNotes: 'Take after breakfast',
    prescriptionType: 'system',
    imageUrl: null,
    prescriptionUrl: 'https://bucket.s3.eu-north-1.amazonaws.com/prescriptions/presc-001.pdf',
    createdAt: '2026-10-06T11:15:00.000Z',
  },
];

const mockPrescriptionMedicines: timelineRepo.RawPrescriptionMedicineRow[] = [
  {
    id: 'med-001',
    prescriptionId: 'presc-001',
    medicineId: 'master-med-001',
    medicineName: 'Tamoxifen',
    strength: '20mg',
    dosage: '20mg',
    frequency: 'Once daily',
    duration: '30 days',
    foodInstruction: 'After Food',
    instructions: 'Take in the morning',
    prescribedQuantity: 30,
    createdAt: '2026-10-06T11:15:00.000Z',
  },
];

const mockPrescriptionLabTests: timelineRepo.RawPrescriptionLabTestRow[] = [
  {
    id: 'plt-001',
    prescriptionId: 'presc-001',
    labTestId: 'master-test-001',
    testName: 'Complete Blood Count (CBC)',
    instructions: 'Fasting not required',
    orderedDate: '2026-10-06',
    doctorId: 'doc-001',
    doctorName: 'Dr. S. Narendran',
    doctorSpecialization: 'Consultant Oncologist',
    createdAt: '2026-10-06T11:15:00.000Z',
  },
];

const mockLabReports: timelineRepo.RawLabReportRow[] = [
  {
    id: 'report-001',
    prescriptionLabTestId: 'plt-001',
    patientId: ALICE_ID,
    fileName: 'CBC_Report_Oct2026.pdf',
    fileType: 'application/pdf',
    fileSize: 1048576,
    reportDate: '2026-10-07',
    documentUrl: 'https://bucket.s3.eu-north-1.amazonaws.com/reports/report-001.pdf',
    storageKey: 'reports/report-001.pdf',
    notes: 'Hemoglobin 13.2 g/dL, Platelets normal',
    isExternal: false,
    testName: 'Complete Blood Count (CBC)',
    createdAt: '2026-10-07T08:00:00.000Z',
  },
  {
    id: 'report-002',
    prescriptionLabTestId: null,
    patientId: ALICE_ID,
    fileName: 'Mammogram_Scan.pdf',
    fileType: 'application/pdf',
    fileSize: 2097152,
    reportDate: '2026-09-15',
    documentUrl: 'https://bucket.s3.eu-north-1.amazonaws.com/reports/report-002.pdf',
    storageKey: 'reports/report-002.pdf',
    notes: 'Bilateral mammography screening',
    isExternal: true,
    testName: 'Mammogram Screening',
    createdAt: '2026-09-15T09:00:00.000Z',
  },
];

const mockMedicineSchedules: timelineRepo.RawMedicineScheduleRow[] = [
  {
    id: 'sched-001',
    prescriptionId: 'presc-001',
    medicineName: 'Tamoxifen',
    scheduledDate: '2026-10-07',
    scheduledTime: '08:00:00',
    doseTimeOfDay: 'Morning',
    status: 'TAKEN',
    takenAt: '2026-10-07T08:10:00.000Z',
  },
  {
    id: 'sched-002',
    prescriptionId: 'presc-001',
    medicineName: 'Tamoxifen',
    scheduledDate: '2026-10-08',
    scheduledTime: '08:00:00',
    doseTimeOfDay: 'Morning',
    status: 'PENDING',
    takenAt: null,
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(s3Service.getReadUrl).mockImplementation(async (key) => `https://signed.s3.amazonaws.com/${key}`);
});

function setupMockRepositories(): void {
  vi.mocked(timelineRepo.getPatientResolvedIds).mockResolvedValue({
    primaryId: ALICE_ID,
    allIds: [ALICE_ID],
  });
  vi.mocked(timelineRepo.getPatientProfile).mockResolvedValue(mockPatientProfile);
  vi.mocked(timelineRepo.getPatientAppointments).mockResolvedValue(mockAppointments);
  vi.mocked(timelineRepo.getPatientPrescriptions).mockResolvedValue(mockPrescriptions);
  vi.mocked(timelineRepo.getPrescriptionMedicines).mockResolvedValue(mockPrescriptionMedicines);
  vi.mocked(timelineRepo.getPrescriptionLabTests).mockResolvedValue(mockPrescriptionLabTests);
  vi.mocked(timelineRepo.getPatientLabReports).mockResolvedValue(mockLabReports);
  vi.mocked(timelineRepo.getPatientMedicineSchedules).mockResolvedValue(mockMedicineSchedules);
}

describe('Medical Timeline API', () => {
  it('1. requires authentication to access medical timeline', async () => {
    const res = await request(app).get('/api/patients/me/medical-timeline');
    expect(res.status).toBe(401);
  });

  it('2. allows authenticated patient to retrieve own timeline', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .get('/api/patients/me/medical-timeline')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(res.status).toBe(200);
    expect(res.body.patient).toBeDefined();
    expect(res.body.patient.name).toBe('BHARATHI M');
    expect(res.body.summary).toBeDefined();
    expect(res.body.timeline).toBeInstanceOf(Array);
    expect(res.body.pagination).toBeDefined();
  });

  it('3. does not allow patient_id query param to override authenticated identity', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .get(`/api/patients/me/medical-timeline?patient_id=${BOB_ID}`)
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(res.status).toBe(200);
    // Verified that it called getPatientResolvedIds with ALICE_ID, ignoring the query param
    expect(timelineRepo.getPatientResolvedIds).toHaveBeenCalledWith(ALICE_ID);
  });

  it('4. returns consultation, prescription, medicine, lab test, lab report, imaging and appointment events', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .get('/api/patients/me/medical-timeline')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(res.status).toBe(200);
    const types = res.body.timeline.map((e: any) => e.type);

    expect(types).toContain('CONSULTATION');
    expect(types).toContain('PRESCRIPTION');
    expect(types).toContain('MEDICINE_STARTED');
    expect(types).toContain('LAB_TEST_ORDERED');
    expect(types).toContain('LAB_REPORT');
    expect(types).toContain('IMAGING');
    expect(types).toContain('APPOINTMENT');
    expect(types).toContain('FOLLOW_UP');
  });

  it('5. consultation event contains diagnosis, notes, and doctor information', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .get('/api/patients/me/medical-timeline?type=CONSULTATION')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(res.status).toBe(200);
    expect(res.body.timeline.length).toBeGreaterThan(0);
    const consult = res.body.timeline[0];
    expect(consult.type).toBe('CONSULTATION');
    expect(consult.reference_type).toBe('appointment');
    expect(consult.doctor.name).toContain('Narendran');
    expect(consult.details.diagnosis).toBe('Early stage breast carcinoma - on maintenance');
    expect(consult.details.doctor_notes).toContain('responding well');
  });

  it('6. prescription event contains medicine details and instructions', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .get('/api/patients/me/medical-timeline?type=PRESCRIPTION')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(res.status).toBe(200);
    const rxEvent = res.body.timeline[0];
    expect(rxEvent.type).toBe('PRESCRIPTION');
    expect(rxEvent.details.medicines[0].name).toBe('Tamoxifen');
    expect(rxEvent.details.medicines[0].dosage).toBe('20mg');
    expect(rxEvent.details.medicines[0].frequency).toBe('Once daily');
  });

  it('7. lab test ordered event has status REPORT_AVAILABLE when report exists', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .get('/api/patients/me/medical-timeline?type=INVESTIGATION')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(res.status).toBe(200);
    const testEvent = res.body.timeline[0];
    expect(testEvent.type).toBe('LAB_TEST_ORDERED');
    expect(testEvent.details.test_name).toBe('Complete Blood Count (CBC)');
    expect(testEvent.details.status).toBe('REPORT_AVAILABLE');
  });

  it('8. sorts events newest to oldest by occurred_at clinical date', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .get('/api/patients/me/medical-timeline')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(res.status).toBe(200);
    const events = res.body.timeline;
    for (let i = 0; i < events.length - 1; i++) {
      const current = new Date(events[i].occurred_at).getTime();
      const next = new Date(events[i + 1].occurred_at).getTime();
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });

  it('9. supports date filtering (from_date and to_date)', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .get('/api/patients/me/medical-timeline?from_date=2026-10-01&to_date=2026-10-07')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(res.status).toBe(200);
    for (const event of res.body.timeline) {
      const dateKey = event.occurred_at.split('T')[0];
      expect(dateKey >= '2026-10-01' && dateKey <= '2026-10-07').toBe(true);
    }
  });

  it('10. validates invalid date ranges with 400', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .get('/api/patients/me/medical-timeline?from_date=2026-10-10&to_date=2026-10-01')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('11. pagination works and does not duplicate events across pages', async () => {
    authAsAlice();
    setupMockRepositories();

    const page1 = await request(app)
      .get('/api/patients/me/medical-timeline?page=1&limit=3')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    const page2 = await request(app)
      .get('/api/patients/me/medical-timeline?page=2&limit=3')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);
    expect(page1.body.timeline.length).toBe(3);
    expect(page1.body.pagination.has_next).toBe(true);

    const idsPage1 = new Set(page1.body.timeline.map((e: any) => e.id));
    for (const e of page2.body.timeline) {
      expect(idsPage1.has(e.id)).toBe(false);
    }
  });

  it('12. calculates correct health summary counts', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .get('/api/patients/me/medical-timeline')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(res.status).toBe(200);
    const summary = res.body.summary;
    expect(summary.consultations_count).toBe(1);
    expect(summary.prescriptions_count).toBe(1);
    expect(summary.investigations_count).toBe(1);
    expect(summary.active_medications).toContain('Tamoxifen');
  });

  it('13. handles empty medical history gracefully with 0 counts', async () => {
    authAsBob();
    vi.mocked(timelineRepo.getPatientResolvedIds).mockResolvedValue({
      primaryId: BOB_ID,
      allIds: [BOB_ID],
    });
    vi.mocked(timelineRepo.getPatientProfile).mockResolvedValue(null);
    vi.mocked(timelineRepo.getPatientAppointments).mockResolvedValue([]);
    vi.mocked(timelineRepo.getPatientPrescriptions).mockResolvedValue([]);
    vi.mocked(timelineRepo.getPrescriptionMedicines).mockResolvedValue([]);
    vi.mocked(timelineRepo.getPrescriptionLabTests).mockResolvedValue([]);
    vi.mocked(timelineRepo.getPatientLabReports).mockResolvedValue([]);
    vi.mocked(timelineRepo.getPatientMedicineSchedules).mockResolvedValue([]);

    const res = await request(app)
      .get('/api/patients/me/medical-timeline')
      .set(...bearer(tokenFor({ id: BOB_ID })));

    expect(res.status).toBe(200);
    expect(res.body.timeline).toEqual([]);
    expect(res.body.summary.consultations_count).toBe(0);
    expect(res.body.summary.prescriptions_count).toBe(0);
    expect(res.body.pagination.total).toBe(0);
  });
});

describe('Second Opinion Medical Summary API', () => {
  it('14. requires authentication for medical summary', async () => {
    const res = await request(app).get('/api/patients/me/medical-summary');
    expect(res.status).toBe(401);
  });

  it('15. returns structured clinical facts via GET /api/patients/me/medical-summary', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .get('/api/patients/me/medical-summary')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(res.status).toBe(200);
    expect(res.body.patient).toBeDefined();
    expect(res.body.clinical_summary).toBeDefined();
    expect(res.body.clinical_summary.allergies).toContain('Penicillin');
    expect(res.body.consultations).toBeDefined();
    expect(res.body.diagnoses).toBeDefined();
    expect(res.body.prescriptions).toBeDefined();
    expect(res.body.medications).toBeDefined();
    expect(res.body.investigations).toBeDefined();
    expect(res.body.lab_reports).toBeDefined();
    expect(res.body.medical_records).toBeDefined();
    expect(res.body.current_status).toBeDefined();
    expect(res.body.current_status.adherence_rate_pct).toBe(50); // 1 of 2 taken
  });

  it('16. supports POST /api/patients/me/medical-summary with date range and selected sections', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .post('/api/patients/me/medical-summary')
      .set(...bearer(tokenFor({ id: ALICE_ID })))
      .send({
        date_range: {
          from: '2026-10-01',
          to: '2026-10-07',
        },
        sections: ['CONSULTATIONS', 'PRESCRIPTIONS', 'MEDICINES'],
      });

    expect(res.status).toBe(200);
    expect(res.body.consultations).toBeDefined();
    expect(res.body.prescriptions).toBeDefined();
    expect(res.body.medications).toBeDefined();
    expect(res.body.lab_reports).toBeUndefined();
    expect(res.body.medical_records).toBeUndefined();
  });
});

describe('Patient Medical History API', () => {
  it('17. requires authentication for medical history', async () => {
    const res = await request(app).get('/api/patients/me/medical-history');
    expect(res.status).toBe(401);
  });

  it('18. returns full aggregated medical history with timeline, consultations, prescriptions, investigations, records, and adherence', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .get('/api/patients/me/medical-history')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(res.status).toBe(200);
    expect(res.body.patient).toBeDefined();
    expect(res.body.patient.name).toBe('BHARATHI M');
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.allergies).toContain('Penicillin');
    expect(res.body.consultations).toBeInstanceOf(Array);
    expect(res.body.diagnoses).toBeInstanceOf(Array);
    expect(res.body.prescriptions).toBeInstanceOf(Array);
    expect(res.body.medications).toBeInstanceOf(Array);
    expect(res.body.investigations).toBeInstanceOf(Array);
    expect(res.body.medical_records).toBeInstanceOf(Array);
    expect(res.body.appointments).toBeInstanceOf(Array);
    expect(res.body.medicine_adherence).toBeInstanceOf(Array);
    expect(res.body.timeline).toBeInstanceOf(Array);
    expect(res.body.timeline.length).toBeGreaterThan(0);
  });

  it('19. downloads Complete Medical History PDF as application/pdf', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .get('/api/patients/me/medical-history/pdf')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('medical_history_');
  });

  it('20. downloads Second Opinion PDF as application/pdf', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .get('/api/patients/me/medical-summary/pdf')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('second_opinion_');
  });

  it('21. downloads Medical Timeline PDF via /api/patients/me/medical-timeline/pdf as application/pdf', async () => {
    authAsAlice();
    setupMockRepositories();

    const res = await request(app)
      .get('/api/patients/me/medical-timeline/pdf')
      .set(...bearer(tokenFor({ id: ALICE_ID })));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('medical_history_');
  });
});


