import { s3Service } from '@/modules/s3/s3.service.js';

import * as repo from './medicalTimeline.repository.js';
import type {
  AdviceSummaryItem,
  AppointmentSummaryItem,
  ClinicalSummary,
  ConsultationSummaryItem,
  CurrentStatusSummary,
  DiagnosisSummaryItem,
  InvestigationSummaryItem,
  LabReportSummaryItem,
  MedicalRecordSummaryItem,
  MedicalSummarySection,
  MedicationSummaryItem,
  PatientSummaryDetail,
  PrescriptionSummaryItem,
  SecondOpinionRequest,
  SecondOpinionSummaryResponse,
  TimelineDoctorSummary,
} from './medicalTimeline.types.js';

const IMAGING_REGEX =
  /(x[-_ ]?ray|mri|ct[-_ ]?scan|computed tomography|ultrasound|usg|sonography|mammogram|mammography|pet[-_ ]?scan|radiology|echo|echocardiogram|doppler|bone scan|angiogram|fluoroscopy)/i;

function toDateKey(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return '';
  if (dateVal instanceof Date) {
    return isNaN(dateVal.getTime())
      ? ''
      : dateVal.toISOString().split('T')[0] ?? '';
  }
  const str = String(dateVal);
  return str.split('T')[0] ?? '';
}

function calculateAge(dobStr: string | null | undefined): number | null {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

async function signUrl(
  urlOrKey: string | null | undefined,
): Promise<string | undefined> {
  if (!urlOrKey) return undefined;
  if (urlOrKey.includes('amazonaws.com')) {
    try {
      const parts = urlOrKey.split('.amazonaws.com/');
      if (parts[1]) {
        const key = parts[1].split('?')[0];
        if (key) {
          return await s3Service.getReadUrl(decodeURIComponent(key), 86400);
        }
      }
    } catch {
      return urlOrKey;
    }
  }
  return urlOrKey;
}

export class MedicalSummaryService {
  async getSecondOpinionSummary(
    userId: string,
    options: SecondOpinionRequest,
  ): Promise<SecondOpinionSummaryResponse> {
    const fromDate = options.from_date || options.date_range?.from;
    const toDate = options.to_date || options.date_range?.to;

    let selectedSections: Set<MedicalSummarySection> | null = null;
    if (options.sections && options.sections.length > 0) {
      if (typeof options.sections === 'string') {
        const parts = (options.sections as string)
          .split(',')
          .map((s) => s.trim().toUpperCase() as MedicalSummarySection);
        selectedSections = new Set(parts);
      } else if (Array.isArray(options.sections)) {
        selectedSections = new Set(
          options.sections.map((s) => s.toUpperCase() as MedicalSummarySection),
        );
      }
    }

    const isSectionIncluded = (section: MedicalSummarySection): boolean => {
      if (!selectedSections || selectedSections.size === 0) return true;
      return selectedSections.has(section);
    };

    const { primaryId, allIds } = await repo.getPatientResolvedIds(userId);

    const [
      patientProfile,
      appointments,
      prescriptions,
      labReports,
      medicineSchedules,
    ] = await Promise.all([
      repo.getPatientProfile(allIds),
      repo.getPatientAppointments(allIds),
      repo.getPatientPrescriptions(allIds),
      repo.getPatientLabReports(allIds),
      repo.getPatientMedicineSchedules(allIds),
    ]);

    const prescriptionIds = prescriptions.map((p) => p.id);

    const [prescriptionMedicines, prescriptionLabTests] = await Promise.all([
      repo.getPrescriptionMedicines(prescriptionIds),
      repo.getPrescriptionLabTests(prescriptionIds, allIds),
    ]);

    // Map medicines by prescriptionId
    const medicinesByPrescription = new Map<
      string,
      repo.RawPrescriptionMedicineRow[]
    >();
    for (const med of prescriptionMedicines) {
      if (!medicinesByPrescription.has(med.prescriptionId)) {
        medicinesByPrescription.set(med.prescriptionId, []);
      }
      medicinesByPrescription.get(med.prescriptionId)!.push(med);
    }

    // Map lab reports by prescriptionLabTestId
    const labReportsByTestId = new Map<string, repo.RawLabReportRow>();
    for (const lr of labReports) {
      if (lr.prescriptionLabTestId) {
        labReportsByTestId.set(lr.prescriptionLabTestId, lr);
      }
    }

    // Sign URLs for reports & prescriptions
    const signedPrescriptionUrls = new Map<string, string | undefined>();
    await Promise.all(
      prescriptions.map(async (p) => {
        const raw = p.prescriptionUrl || p.imageUrl;
        if (raw) {
          const signed = await signUrl(raw);
          signedPrescriptionUrls.set(p.id, signed);
        }
      }),
    );

    const signedReportUrls = new Map<string, string>();
    await Promise.all(
      labReports.map(async (lr) => {
        const signed =
          (await signUrl(lr.storageKey || lr.documentUrl)) || lr.documentUrl;
        signedReportUrls.set(lr.id, signed);
      }),
    );

    // Filter helper by date range
    const isWithinDateRange = (dateStr: string | Date | null | undefined): boolean => {
      const key = toDateKey(dateStr);
      if (!key) return true;
      if (fromDate && key < fromDate) return false;
      if (toDate && key > toDate) return false;
      return true;
    };

    // 1. Patient Details
    const patient: PatientSummaryDetail = {
      id: patientProfile?.id || primaryId,
      name: patientProfile?.name || 'Patient',
      date_of_birth: patientProfile?.dateOfBirth || null,
      age: calculateAge(patientProfile?.dateOfBirth),
      gender: patientProfile?.gender || null,
      phone: patientProfile?.phone || null,
      email: patientProfile?.email || null,
      blood_group: patientProfile?.bloodGroup || null,
      height_cm: patientProfile?.heightCm !== null ? Number(patientProfile?.heightCm) : null,
      weight_kg: patientProfile?.weightKg !== null ? Number(patientProfile?.weightKg) : null,
    };

    // Basic medical info from profile
    const basicMedical =
      typeof patientProfile?.basicMedicalInfo === 'object' &&
      patientProfile.basicMedicalInfo !== null
        ? (patientProfile.basicMedicalInfo as Record<string, unknown>)
        : {};

    const allergies: string[] = Array.isArray(basicMedical['allergies'])
      ? (basicMedical['allergies'] as string[])
      : [];

    // 2. Completed Consultations & Diagnoses & Recent Advice
    const consultations: ConsultationSummaryItem[] = [];
    const diagnoses: DiagnosisSummaryItem[] = [];
    const recentAdvice: AdviceSummaryItem[] = [];

    const completedAppts = appointments.filter(
      (a) =>
        a.status === 'completed' ||
        Boolean(a.diagnosis) ||
        Boolean(a.consultationNotes),
    );

    for (const appt of completedAppts) {
      if (!isWithinDateRange(appt.scheduledStart)) continue;

      const doctor: TimelineDoctorSummary = {
        id: appt.doctorId || 'dr-narendran',
        name: appt.doctorName
          ? `Dr. ${appt.doctorName.replace(/^Dr\.\s*/i, '')}`
          : 'Dr. S. Narendran',
        specialization: appt.doctorSpecialization || 'General Medicine',
      };

      const dateStr = toDateKey(appt.scheduledStart);

      consultations.push({
        id: appt.id,
        date: dateStr,
        doctor,
        purpose: appt.purpose || appt.visitReason || null,
        diagnosis: appt.diagnosis || null,
        doctor_notes: appt.consultationNotes || null,
        advice: appt.consultationNotes || null,
        status: appt.status,
      });

      if (appt.diagnosis?.trim()) {
        diagnoses.push({
          diagnosis: appt.diagnosis.trim(),
          diagnosed_date: dateStr,
          doctor,
          reference_id: appt.id,
        });
      }

      if (appt.consultationNotes?.trim()) {
        recentAdvice.push({
          date: dateStr,
          advice: appt.consultationNotes.trim(),
          doctor,
          reference_id: appt.id,
        });
      }
    }

    // 3. Prescriptions & Medications
    const prescriptionList: PrescriptionSummaryItem[] = [];
    const medicationList: MedicationSummaryItem[] = [];
    const activeMedicationsSet = new Set<string>();

    for (const rx of prescriptions) {
      const rxDate = rx.prescriptionDate || rx.createdAt;
      if (!isWithinDateRange(rxDate)) continue;

      const doctor: TimelineDoctorSummary = {
        id: rx.doctorId || 'dr-narendran',
        name: rx.doctorName
          ? `Dr. ${rx.doctorName.replace(/^Dr\.\s*/i, '')}`
          : 'Dr. S. Narendran',
        specialization: rx.doctorSpecialization || 'General Medicine',
      };

      const meds = medicinesByPrescription.get(rx.id) || [];
      const signedUrlVal = signedPrescriptionUrls.get(rx.id);

      prescriptionList.push({
        id: rx.id,
        date: toDateKey(rxDate),
        doctor,
        status: rx.status,
        additional_notes: rx.additionalNotes || null,
        medicine_count: meds.length,
        prescription_url: signedUrlVal || null,
        medicines: meds.map((m) => ({
          name: m.medicineName,
          dosage: m.dosage || null,
          frequency: m.frequency || null,
          duration: m.duration || null,
          instructions: m.instructions || null,
          food_instruction: m.foodInstruction || null,
        })),
      });

      for (const m of meds) {
        medicationList.push({
          name: m.medicineName,
          dosage: m.dosage || null,
          frequency: m.frequency || null,
          duration: m.duration || null,
          food_instruction: m.foodInstruction || null,
          instructions: m.instructions || null,
          started_date: toDateKey(rxDate),
          status: rx.status,
          prescribed_by: doctor,
        });

        if (rx.status?.toLowerCase() === 'active' && m.medicineName) {
          activeMedicationsSet.add(m.medicineName.trim());
        }
      }
    }

    if (Array.isArray(basicMedical['currentMedication'])) {
      for (const med of basicMedical['currentMedication']) {
        if (typeof med === 'string' && med.trim()) {
          activeMedicationsSet.add(med.trim());
        }
      }
    }

    // 4. Investigations & Lab Reports
    const investigationList: InvestigationSummaryItem[] = [];
    for (const plt of prescriptionLabTests) {
      const orderedDate = plt.orderedDate || plt.createdAt;
      if (!isWithinDateRange(orderedDate)) continue;

      const doctor: TimelineDoctorSummary | null = plt.doctorId
        ? {
            id: plt.doctorId,
            name: plt.doctorName
              ? `Dr. ${plt.doctorName.replace(/^Dr\.\s*/i, '')}`
              : 'Dr. S. Narendran',
            specialization: plt.doctorSpecialization || 'General Medicine',
          }
        : null;

      const report = labReportsByTestId.get(plt.id);
      const isAvailable = Boolean(report);

      investigationList.push({
        id: plt.id,
        test_name: plt.testName,
        ordered_date: toDateKey(orderedDate),
        instructions: plt.instructions || null,
        status: isAvailable ? 'REPORT_AVAILABLE' : 'AWAITING_RESULT',
        doctor,
        report: report
          ? {
              id: report.id,
              file_name: report.fileName,
              report_date: toDateKey(report.reportDate),
              document_url:
                signedReportUrls.get(report.id) || report.documentUrl,
            }
          : null,
      });
    }

    const labReportList: LabReportSummaryItem[] = [];
    const medicalRecordList: MedicalRecordSummaryItem[] = [];

    for (const lr of labReports) {
      if (!isWithinDateRange(lr.reportDate)) continue;

      const signedDocUrl = signedReportUrls.get(lr.id) || lr.documentUrl;
      const testName = lr.testName || lr.fileName;

      labReportList.push({
        id: lr.id,
        test_name: testName,
        file_name: lr.fileName,
        file_type: lr.fileType,
        report_date: toDateKey(lr.reportDate),
        document_url: signedDocUrl,
        notes: lr.notes || null,
        is_external: lr.isExternal,
      });

      const isImaging =
        IMAGING_REGEX.test(testName) || IMAGING_REGEX.test(lr.notes || '');

      medicalRecordList.push({
        id: lr.id,
        title: testName,
        record_type: isImaging ? 'IMAGING' : 'LAB_REPORT',
        record_date: toDateKey(lr.reportDate),
        document_url: signedDocUrl,
        file_name: lr.fileName,
        notes: lr.notes || null,
      });
    }

    // Add upload prescriptions to medical records
    for (const rx of prescriptions) {
      const rxDate = rx.prescriptionDate || rx.createdAt;
      if (!isWithinDateRange(rxDate)) continue;

      const signedUrlVal = signedPrescriptionUrls.get(rx.id);
      if (signedUrlVal || rx.prescriptionType === 'upload') {
        const title = rx.additionalNotes || 'Prescription Document';
        const isImaging = IMAGING_REGEX.test(title);

        medicalRecordList.push({
          id: rx.id,
          title,
          record_type: isImaging ? 'IMAGING' : 'PRESCRIPTION',
          record_date: toDateKey(rxDate),
          document_url: signedUrlVal || undefined,
          notes: rx.additionalNotes || null,
        });
      }
    }

    // 5. Appointments
    const appointmentList: AppointmentSummaryItem[] = [];
    for (const appt of appointments) {
      if (!isWithinDateRange(appt.scheduledStart)) continue;

      const doctor: TimelineDoctorSummary = {
        id: appt.doctorId || 'dr-narendran',
        name: appt.doctorName
          ? `Dr. ${appt.doctorName.replace(/^Dr\.\s*/i, '')}`
          : 'Dr. S. Narendran',
        specialization: appt.doctorSpecialization || 'General Medicine',
      };

      const startIso =
        appt.scheduledStart instanceof Date
          ? appt.scheduledStart.toISOString()
          : String(appt.scheduledStart);

      appointmentList.push({
        id: appt.id,
        date: toDateKey(appt.scheduledStart),
        time: startIso.split('T')[1]?.slice(0, 5) || '',
        doctor,
        purpose: appt.purpose || appt.visitReason || null,
        status: appt.status,
      });
    }

    // 6. Adherence / Current Status Calculation
    let adherenceRate: number | null = null;
    if (medicineSchedules.length > 0) {
      const takenCount = medicineSchedules.filter(
        (s) => s.status?.toUpperCase() === 'TAKEN',
      ).length;
      adherenceRate = Math.round((takenCount / medicineSchedules.length) * 100);
    }

    const lastVisit = completedAppts[0];
    const nextAppt = appointments
      .filter(
        (a) =>
          a.status === 'scheduled' &&
          new Date(a.scheduledStart).getTime() >= Date.now(),
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledStart).getTime() -
          new Date(b.scheduledStart).getTime(),
      )[0];

    const currentStatus: CurrentStatusSummary = {
      last_visit_date: lastVisit ? toDateKey(lastVisit.scheduledStart) : null,
      next_appointment_date: nextAppt
        ? toDateKey(nextAppt.scheduledStart)
        : null,
      adherence_rate_pct: adherenceRate,
    };

    // 7. Clinical Summary
    const primaryCondition =
      diagnoses[0]?.diagnosis ||
      (lastVisit?.diagnosis ? lastVisit.diagnosis : 'None reported');

    const clinicalSummary: ClinicalSummary = {
      primary_condition: primaryCondition,
      current_treatment:
        prescriptionList[0]?.additional_notes ||
        (consultations[0]?.doctor_notes ? consultations[0].doctor_notes : 'Standard clinical care plan'),
      current_medications: Array.from(activeMedicationsSet),
      allergies,
      important_alerts: allergies.map((a) => `Known Allergy: ${a}`),
    };

    // Construct final response respecting requested sections
    const response: SecondOpinionSummaryResponse = {
      patient,
      clinical_summary: clinicalSummary,
      current_status: currentStatus,
    };

    if (isSectionIncluded('CONSULTATIONS')) {
      response.consultations = consultations;
    }
    if (isSectionIncluded('DIAGNOSES')) {
      response.diagnoses = diagnoses;
    }
    if (isSectionIncluded('PRESCRIPTIONS')) {
      response.prescriptions = prescriptionList;
    }
    if (isSectionIncluded('MEDICINES')) {
      response.medications = medicationList;
    }
    if (isSectionIncluded('INVESTIGATIONS')) {
      response.investigations = investigationList;
    }
    if (isSectionIncluded('LAB_REPORTS')) {
      response.lab_reports = labReportList;
    }
    if (isSectionIncluded('MEDICAL_RECORDS')) {
      response.medical_records = medicalRecordList;
    }
    if (isSectionIncluded('APPOINTMENTS')) {
      response.appointments = appointmentList;
    }
    if (isSectionIncluded('RECENT_ADVICE')) {
      response.recent_advice = recentAdvice;
    }

    return response;
  }
}

export const medicalSummaryService = new MedicalSummaryService();
