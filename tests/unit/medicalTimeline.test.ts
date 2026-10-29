import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/patients/medicalTimeline.repository.js');
vi.mock('@/modules/s3/s3.service.js');

import * as repo from '@/modules/patients/medicalTimeline.repository.js';
import { medicalSummaryService } from '@/modules/patients/medicalSummary.service.js';
import { medicalTimelineService } from '@/modules/patients/medicalTimeline.service.js';
import { s3Service } from '@/modules/s3/s3.service.js';

const PATIENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(s3Service.getReadUrl).mockImplementation(async (key) => `https://signed.s3.com/${key}`);
});

describe('medicalTimelineService unit tests', () => {
  it('handles missing optional fields on patient, appointment, and prescription safely', async () => {
    vi.mocked(repo.getPatientResolvedIds).mockResolvedValue({
      primaryId: PATIENT_ID,
      allIds: [PATIENT_ID],
    });
    vi.mocked(repo.getPatientProfile).mockResolvedValue({
      id: PATIENT_ID,
      userAccountId: null,
      name: 'John Doe',
      phone: null,
      email: null,
      dateOfBirth: null, // missing DOB
      gender: null,
      heightCm: null,
      weightKg: null,
      bloodGroup: null,
      maritalStatus: null,
      basicMedicalInfo: null,
      emergencyContacts: null,
      profileImageUrl: null,
      createdAt: '2026-01-01',
    });

    vi.mocked(repo.getPatientAppointments).mockResolvedValue([
      {
        id: 'appt-sparse',
        patientId: PATIENT_ID,
        doctorId: 'doc-sparse',
        doctorName: null, // missing doctor name
        doctorSpecialization: null,
        scheduledStart: '2026-10-01T10:00:00.000Z',
        scheduledEnd: '2026-10-01T10:30:00.000Z',
        status: 'scheduled',
        purpose: null,
        visitReason: null,
        rescheduleReason: null,
        cancellationReason: null,
        consultationNotes: null,
        diagnosis: null,
        vitals: null,
        createdAt: '2026-10-01T09:00:00.000Z',
      },
    ]);

    vi.mocked(repo.getPatientPrescriptions).mockResolvedValue([
      {
        id: 'rx-sparse',
        patientId: PATIENT_ID,
        doctorId: 'doc-sparse',
        doctorName: null,
        doctorSpecialization: null,
        appointmentId: null,
        prescriptionDate: '2026-10-01',
        status: 'active',
        additionalNotes: null,
        prescriptionType: null,
        imageUrl: null,
        prescriptionUrl: null,
        createdAt: '2026-10-01T10:00:00.000Z',
      },
    ]);

    vi.mocked(repo.getPrescriptionMedicines).mockResolvedValue([
      {
        id: 'med-sparse',
        prescriptionId: 'rx-sparse',
        medicineId: null,
        medicineName: 'Paracetamol',
        strength: null,
        dosage: null,
        frequency: null,
        duration: null,
        foodInstruction: null,
        instructions: null,
        prescribedQuantity: 1,
        createdAt: '2026-10-01T10:00:00.000Z',
      },
    ]);

    vi.mocked(repo.getPrescriptionLabTests).mockResolvedValue([]);
    vi.mocked(repo.getPatientLabReports).mockResolvedValue([]);
    vi.mocked(repo.getPatientMedicineSchedules).mockResolvedValue([]);

    const result = await medicalTimelineService.getMedicalTimeline(PATIENT_ID, {
      page: 1,
      limit: 20,
    });

    expect(result).toBeDefined();
    expect(result.patient.age).toBeNull();
    expect(result.patient.gender).toBeNull();
    expect(result.timeline.length).toBeGreaterThan(0);
    const rxEvent = result.timeline.find((e) => e.type === 'PRESCRIPTION');
    expect(rxEvent).toBeDefined();
    expect(rxEvent?.doctor?.name).toBe('Dr. S. Narendran');
  });

  it('filters by MEDICINE type and returns only medicine-lifecycle events', async () => {
    vi.mocked(repo.getPatientResolvedIds).mockResolvedValue({
      primaryId: PATIENT_ID,
      allIds: [PATIENT_ID],
    });
    vi.mocked(repo.getPatientProfile).mockResolvedValue(null);
    vi.mocked(repo.getPatientAppointments).mockResolvedValue([]);
    vi.mocked(repo.getPatientPrescriptions).mockResolvedValue([
      {
        id: 'rx-1',
        patientId: PATIENT_ID,
        doctorId: 'doc-1',
        doctorName: 'Dr. Test',
        doctorSpecialization: 'Oncology',
        appointmentId: null,
        prescriptionDate: '2026-10-01',
        status: 'active',
        additionalNotes: null,
        prescriptionType: 'system',
        imageUrl: null,
        prescriptionUrl: null,
        createdAt: '2026-10-01',
      },
    ]);
    vi.mocked(repo.getPrescriptionMedicines).mockResolvedValue([
      {
        id: 'med-1',
        prescriptionId: 'rx-1',
        medicineId: 'm-1',
        medicineName: 'Aspirin',
        strength: '100mg',
        dosage: '1 tab',
        frequency: 'Daily',
        duration: '10 days',
        foodInstruction: 'After Food',
        instructions: null,
        prescribedQuantity: 10,
        createdAt: '2026-10-01',
      },
    ]);
    vi.mocked(repo.getPrescriptionLabTests).mockResolvedValue([]);
    vi.mocked(repo.getPatientLabReports).mockResolvedValue([]);
    vi.mocked(repo.getPatientMedicineSchedules).mockResolvedValue([]);

    const result = await medicalTimelineService.getMedicalTimeline(PATIENT_ID, {
      type: 'MEDICINE',
    });

    expect(result.timeline.length).toBe(1);
    expect(result.timeline[0]?.type).toBe('MEDICINE_STARTED');
    expect(result.timeline[0]?.title).toBe('Medicine Started: Aspirin');
  });
});

describe('medicalSummaryService unit tests', () => {
  it('correctly filters summary by selected date range and sections', async () => {
    vi.mocked(repo.getPatientResolvedIds).mockResolvedValue({
      primaryId: PATIENT_ID,
      allIds: [PATIENT_ID],
    });
    vi.mocked(repo.getPatientProfile).mockResolvedValue({
      id: PATIENT_ID,
      userAccountId: null,
      name: 'Alice',
      phone: null,
      email: null,
      dateOfBirth: '1990-01-01',
      gender: 'Female',
      heightCm: 160,
      weightKg: 55,
      bloodGroup: 'O+',
      maritalStatus: null,
      basicMedicalInfo: {
        allergies: ['Sulfa'],
        currentMedication: ['Metformin'],
      },
      emergencyContacts: null,
      profileImageUrl: null,
      createdAt: '2026-01-01',
    });

    vi.mocked(repo.getPatientAppointments).mockResolvedValue([
      {
        id: 'appt-old',
        patientId: PATIENT_ID,
        doctorId: 'doc-1',
        doctorName: 'Dr. Old',
        doctorSpecialization: 'General',
        scheduledStart: '2025-01-01T10:00:00.000Z',
        scheduledEnd: '2025-01-01T10:30:00.000Z',
        status: 'completed',
        purpose: 'Old Visit',
        visitReason: null,
        rescheduleReason: null,
        cancellationReason: null,
        consultationNotes: 'Old notes',
        diagnosis: 'Old condition',
        vitals: null,
        createdAt: '2025-01-01',
      },
      {
        id: 'appt-recent',
        patientId: PATIENT_ID,
        doctorId: 'doc-1',
        doctorName: 'Dr. Recent',
        doctorSpecialization: 'General',
        scheduledStart: '2026-05-01T10:00:00.000Z',
        scheduledEnd: '2026-05-01T10:30:00.000Z',
        status: 'completed',
        purpose: 'Recent Visit',
        visitReason: null,
        rescheduleReason: null,
        cancellationReason: null,
        consultationNotes: 'Recent advice',
        diagnosis: 'Recent condition',
        vitals: null,
        createdAt: '2026-05-01',
      },
    ]);

    vi.mocked(repo.getPatientPrescriptions).mockResolvedValue([]);
    vi.mocked(repo.getPrescriptionMedicines).mockResolvedValue([]);
    vi.mocked(repo.getPrescriptionLabTests).mockResolvedValue([]);
    vi.mocked(repo.getPatientLabReports).mockResolvedValue([]);
    vi.mocked(repo.getPatientMedicineSchedules).mockResolvedValue([]);

    const summary = await medicalSummaryService.getSecondOpinionSummary(PATIENT_ID, {
      from_date: '2026-01-01',
      to_date: '2026-12-31',
      sections: ['CONSULTATIONS', 'DIAGNOSES'],
    });

    expect(summary.patient.name).toBe('Alice');
    expect(summary.consultations?.length).toBe(1);
    expect(summary.consultations?.[0]?.id).toBe('appt-recent');
    expect(summary.diagnoses?.length).toBe(1);
    expect(summary.diagnoses?.[0]?.diagnosis).toBe('Recent condition');
    expect(summary.prescriptions).toBeUndefined();
    expect(summary.investigations).toBeUndefined();
  });
});
