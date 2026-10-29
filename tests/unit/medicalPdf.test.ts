import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/patients/pdf/pdf.helpers.js', async () => {
  const actual = await vi.importActual<any>('@/modules/patients/pdf/pdf.helpers.js');
  return {
    ...actual,
    htmlToPdfBuffer: vi.fn().mockImplementation(async (html: string) => Buffer.from(`%PDF-MOCK-${html.length}`)),
  };
});

import type { MedicalHistoryResponse, SecondOpinionSummaryResponse } from '@/modules/patients/medicalTimeline.types.js';
import { MedicalHistoryPdfService, SecondOpinionPdfService } from '@/modules/patients/pdf/index.js';

describe('MedicalHistoryPdfService Unit Tests', () => {
  it('1. builds valid HTML and generates PDF for empty medical history', async () => {
    const emptyData: MedicalHistoryResponse = {
      patient: {
        id: 'patient-empty',
        name: 'Empty Patient',
        date_of_birth: null,
        age: null,
        gender: null,
        blood_group: null,
      },
      summary: {
        active_conditions: [],
        active_medications: [],
        allergies: [],
        important_alerts: [],
        last_consultation: null,
        upcoming_follow_up: null,
      },
      consultations: [],
      diagnoses: [],
      prescriptions: [],
      medications: [],
      investigations: [],
      medical_records: [],
      appointments: [],
      medicine_adherence: [],
      timeline: [],
    };

    const html = MedicalHistoryPdfService.buildHtml(emptyData);
    expect(html).toContain('Empty Patient');
    expect(html).toContain('MEDICAL HISTORY &amp; CLINICAL SUMMARY');
    expect(html).toContain('No timeline events recorded.');

    const pdfBuffer = await MedicalHistoryPdfService.generatePdf(emptyData);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
  });

  it('2. safely formats and escapes special characters and handles long texts', async () => {
    const complexData: MedicalHistoryResponse = {
      patient: {
        id: 'p-12345678-abcd',
        name: 'Jane & "Special" <Tag> O\'Connor',
        date_of_birth: '1985-06-20',
        age: 41,
        gender: 'Female',
        blood_group: 'AB+',
      },
      summary: {
        active_conditions: ['Condition <A>', 'Condition & B'],
        active_medications: ['Drug 1 (100mg)', 'Drug 2 & 3'],
        allergies: ['Penicillin & Sulfa'],
        important_alerts: ['High alert: <Allergy>'],
        last_consultation: {
          date: '2026-10-01',
          doctor: 'Dr. Test <Specialist>',
          diagnosis: 'Severe Complex Condition & Assessment',
        },
        upcoming_follow_up: {
          date: '2026-11-01',
          time: '14:30',
          doctor: 'Dr. Test',
          purpose: 'Follow-up & Evaluation',
        },
      },
      consultations: [
        {
          id: 'c-1',
          date: '2026-10-01',
          doctor: {
            id: 'd-1',
            name: 'Dr. A. Specialist',
            specialization: 'Oncology',
          },
          purpose: 'Comprehensive Consultation & Chemotherapy Review',
          diagnosis: 'Invasive Ductal Carcinoma Grade III (ER/PR+, HER2-)',
          doctor_notes: 'Extremely detailed clinical notes describing patient response, toxicity screening, and supportive medications.',
          advice: 'Continue hormonal therapy and schedule CBC test in 2 weeks.',
          status: 'completed',
        },
      ],
      diagnoses: [
        {
          diagnosis: 'Invasive Ductal Carcinoma Grade III (ER/PR+, HER2-)',
          diagnosed_date: '2026-10-01',
          doctor: {
            id: 'd-1',
            name: 'Dr. A. Specialist',
            specialization: 'Oncology',
          },
          reference_id: 'c-1',
        },
      ],
      prescriptions: [
        {
          id: 'rx-1',
          date: '2026-10-01',
          doctor: {
            id: 'd-1',
            name: 'Dr. A. Specialist',
            specialization: 'Oncology',
          },
          status: 'active',
          additional_notes: 'Take with full glass of water after food',
          medicine_count: 2,
          prescription_url: 'https://example.com/rx.pdf',
          medicines: [
            {
              name: 'Tamoxifen Citrate',
              dosage: '20mg',
              frequency: 'Once daily',
              duration: '3 months',
              food_instruction: 'After Food',
              instructions: 'Morning administration',
            },
            {
              name: 'Calcium + Vitamin D3',
              dosage: '500mg/400IU',
              frequency: 'Twice daily',
              duration: '3 months',
              food_instruction: 'After Food',
            },
          ],
        },
      ],
      medications: [
        {
          name: 'Tamoxifen Citrate',
          dosage: '20mg',
          frequency: 'Once daily',
          duration: '3 months',
          food_instruction: 'After Food',
          instructions: 'Morning administration',
          started_date: '2026-10-01',
          status: 'active',
          prescribed_by: {
            id: 'd-1',
            name: 'Dr. A. Specialist',
            specialization: 'Oncology',
          },
        },
      ],
      investigations: [
        {
          id: 'inv-1',
          test_name: 'Serum CA 15-3 & CEA Tumor Markers',
          ordered_date: '2026-10-01',
          instructions: 'Fasting 8 hours required',
          status: 'REPORT_AVAILABLE',
          doctor: {
            id: 'd-1',
            name: 'Dr. A. Specialist',
            specialization: 'Oncology',
          },
        },
      ],
      medical_records: [
        {
          id: 'doc-1',
          title: 'Histopathology Biopsy Report',
          record_type: 'LAB_REPORT',
          record_date: '2026-09-25',
          notes: 'Confirmed invasive malignancy with clear margins',
        },
      ],
      appointments: [
        {
          id: 'a-1',
          date: '2026-10-01',
          time: '10:00',
          doctor: {
            id: 'd-1',
            name: 'Dr. A. Specialist',
            specialization: 'Oncology',
          },
          purpose: 'Clinical Evaluation',
          status: 'completed',
        },
      ],
      medicine_adherence: [
        {
          id: 'sched-1',
          medicine_name: 'Tamoxifen Citrate',
          scheduled_date: '2026-10-02',
          scheduled_time: '08:00',
          dose_time_of_day: 'Morning',
          status: 'TAKEN',
          taken_at: '2026-10-02T08:15:00.000Z',
        },
      ],
      timeline: [
        {
          id: 't-1',
          type: 'CONSULTATION',
          occurred_at: '2026-10-01T10:00:00.000Z',
          title: 'Consultation & Review',
          summary: 'Invasive Ductal Carcinoma Grade III - Treatment planning',
          reference_id: 'c-1',
          reference_type: 'appointment',
          doctor: {
            id: 'd-1',
            name: 'Dr. A. Specialist',
            specialization: 'Oncology',
          },
          details: {},
        },
      ],
    };

    const html = MedicalHistoryPdfService.buildHtml(complexData);
    expect(html).toContain('Jane &amp; &quot;Special&quot; &lt;Tag&gt; O&#039;Connor');
    expect(html).toContain('Invasive Ductal Carcinoma Grade III');
    expect(html).toContain('Tamoxifen Citrate');
    expect(html).toContain('Serum CA 15-3');

    const pdfBuffer = await MedicalHistoryPdfService.generatePdf(complexData);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
  });
});

describe('SecondOpinionPdfService Unit Tests', () => {
  it('3. builds second opinion HTML and handles missing doctor info gracefully', async () => {
    const summaryData: SecondOpinionSummaryResponse = {
      patient: {
        id: 'patient-sec-op',
        name: 'Robert Smith',
        date_of_birth: '1975-03-12',
        age: 51,
        gender: 'Male',
        phone: '+91 9999999999',
        email: 'robert@example.com',
        blood_group: 'A+',
        height_cm: 178,
        weight_kg: 82,
      },
      clinical_summary: {
        primary_condition: 'Stage II Colon Adenocarcinoma',
        current_treatment: 'Adjuvant FOLFOX chemotherapy regimen',
        current_medications: ['Oxaliplatin', 'Capecitabine'],
        allergies: ['Aspirin'],
        important_alerts: ['Known Allergy: Aspirin'],
      },
      consultations: [
        {
          id: 'c-sec-1',
          date: '2026-10-05',
          doctor: {
            id: 'd-default',
            name: 'Dr. S. Narendran',
            specialization: 'Surgical Oncologist',
          },
          purpose: 'Second Opinion Pre-Chemo Assessment',
          diagnosis: 'Colon Adenocarcinoma (pT3N1M0)',
          doctor_notes: 'Reviewed external surgical histology. Fit for systemic therapy.',
          advice: 'Initiate FOLFOX. Baseline ECHO and CBC normal.',
          status: 'completed',
        },
      ],
      diagnoses: [
        {
          diagnosis: 'Colon Adenocarcinoma (pT3N1M0)',
          diagnosed_date: '2026-10-05',
          doctor: null, // missing doctor
          reference_id: 'c-sec-1',
        },
      ],
      medications: [
        {
          name: 'Capecitabine',
          dosage: '1000mg',
          frequency: 'Twice daily',
          duration: '14 days',
          food_instruction: 'Within 30 mins after food',
          instructions: 'Take with plenty of water',
          started_date: '2026-10-06',
          status: 'active',
          prescribed_by: null,
        },
      ],
      investigations: [
        {
          id: 'inv-sec-1',
          test_name: 'Contrast Enhanced CT Abdomen & Pelvis',
          ordered_date: '2026-10-01',
          instructions: null,
          status: 'REPORT_AVAILABLE',
          doctor: null,
          report: {
            id: 'rep-1',
            file_name: 'CT_Scan_Report.pdf',
            report_date: '2026-10-03',
            document_url: 'https://example.com/ct.pdf',
          },
        },
      ],
      lab_reports: [
        {
          id: 'rep-1',
          test_name: 'Contrast Enhanced CT Abdomen & Pelvis',
          file_name: 'CT_Scan_Report.pdf',
          file_type: 'application/pdf',
          report_date: '2026-10-03',
          document_url: 'https://example.com/ct.pdf',
          notes: 'No distant liver or lung metastases seen.',
          is_external: true,
        },
      ],
      current_status: {
        last_visit_date: '2026-10-05',
        next_appointment_date: '2026-10-19',
        adherence_rate_pct: 95,
      },
    };

    const html = SecondOpinionPdfService.buildHtml(summaryData);
    expect(html).toContain('Robert Smith');
    expect(html).toContain('MEDICAL SECOND OPINION SUMMARY');
    expect(html).toContain('Stage II Colon Adenocarcinoma');
    expect(html).toContain('Adjuvant FOLFOX');
    expect(html).toContain('95% Compliant');

    const pdfBuffer = await SecondOpinionPdfService.generatePdf(summaryData);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
  });
});
