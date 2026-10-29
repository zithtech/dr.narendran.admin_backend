import { s3Service } from '@/modules/s3/s3.service.js';

import * as repo from './medicalTimeline.repository.js';
import { medicalSummaryService } from './medicalSummary.service.js';
import type {
  GetMedicalTimelineQuery,
  HealthSummary,
  MedicalHistoryResponse,
  MedicalTimelineResponse,
  MedicineAdherenceItem,
  PatientTimelineHeader,
  TimelineDoctorSummary,
  TimelineEvent,
  TimelineEventType,
  TimelineFilterType,
} from './medicalTimeline.types.js';

const IMAGING_REGEX =
  /(x[-_ ]?ray|mri|ct[-_ ]?scan|computed tomography|ultrasound|usg|sonography|mammogram|mammography|pet[-_ ]?scan|radiology|echo|echocardiogram|doppler|bone scan|angiogram|fluoroscopy)/i;

/**
 * Format a Date or date string to ISO-8601 string.
 */
function toIsoString(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return new Date().toISOString();
  if (dateVal instanceof Date) {
    return isNaN(dateVal.getTime())
      ? new Date().toISOString()
      : dateVal.toISOString();
  }
  const parsed = new Date(dateVal);
  return isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

/**
 * Extract YYYY-MM-DD from an ISO string or Date.
 */
function toDateKey(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return '';
  const iso = toIsoString(dateVal);
  return iso.split('T')[0] ?? '';
}

/**
 * Calculate age in years from date of birth.
 */
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

/**
 * Sign URL if it is from AWS S3 or a storage key.
 */
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

export class MedicalTimelineService {
  async getMedicalTimeline(
    userId: string,
    query: GetMedicalTimelineQuery,
  ): Promise<MedicalTimelineResponse> {
    const { primaryId, allIds } = await repo.getPatientResolvedIds(userId);

    // Fetch all clinical data in parallel for high efficiency
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

    // Map lab tests by prescriptionId
    const labTestsByPrescription = new Map<
      string,
      repo.RawPrescriptionLabTestRow[]
    >();
    for (const plt of prescriptionLabTests) {
      if (!labTestsByPrescription.has(plt.prescriptionId)) {
        labTestsByPrescription.set(plt.prescriptionId, []);
      }
      labTestsByPrescription.get(plt.prescriptionId)!.push(plt);
    }

    // Map lab reports by prescriptionLabTestId
    const labReportsByTestId = new Map<string, repo.RawLabReportRow>();
    for (const lr of labReports) {
      if (lr.prescriptionLabTestId) {
        labReportsByTestId.set(lr.prescriptionLabTestId, lr);
      }
    }

    // Sign URLs for reports and prescriptions in parallel
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
        const signed = (await signUrl(lr.storageKey || lr.documentUrl)) || lr.documentUrl;
        signedReportUrls.set(lr.id, signed);
      }),
    );

    // Build timeline events
    const events: TimelineEvent[] = [];
    const eventIdSet = new Set<string>();

    const addEvent = (event: TimelineEvent) => {
      if (!eventIdSet.has(event.id)) {
        eventIdSet.add(event.id);
        events.push(event);
      }
    };

    // 1. Consultation Events (from completed appointments or appointments with clinical notes/diagnosis)
    for (const appt of appointments) {
      const isCompleted =
        appt.status === 'completed' ||
        Boolean(appt.diagnosis) ||
        Boolean(appt.consultationNotes);

      const doctor: TimelineDoctorSummary = {
        id: appt.doctorId || 'dr-narendran',
        name: appt.doctorName
          ? `Dr. ${appt.doctorName.replace(/^Dr\.\s*/i, '')}`
          : 'Dr. S. Narendran',
        specialization: appt.doctorSpecialization || 'General Medicine',
      };

      if (isCompleted) {
        // Linked prescriptions for this appointment
        const linkedPrescriptions = prescriptions.filter(
          (p) => p.appointmentId === appt.id,
        );
        const linkedLabTests = linkedPrescriptions.flatMap(
          (p) => labTestsByPrescription.get(p.id) || [],
        );

        addEvent({
          id: `consultation-${appt.id}`,
          type: 'CONSULTATION',
          occurred_at: toIsoString(appt.scheduledStart),
          title: appt.purpose
            ? `Consultation: ${appt.purpose}`
            : 'Doctor Consultation',
          summary:
            appt.diagnosis ||
            appt.consultationNotes ||
            `Consultation with ${doctor.name}`,
          reference_id: appt.id,
          reference_type: 'appointment',
          doctor,
          details: {
            appointment_id: appt.id,
            diagnosis: appt.diagnosis || null,
            doctor_notes: appt.consultationNotes || null,
            advice: appt.consultationNotes || null,
            vitals: appt.vitals || null,
            prescription_count: linkedPrescriptions.length,
            investigation_count: linkedLabTests.length,
          },
        });

        // Doctor note event if requested
        if (appt.consultationNotes) {
          addEvent({
            id: `doctor-note-${appt.id}`,
            type: 'DOCTOR_NOTE',
            occurred_at: toIsoString(appt.scheduledStart),
            title: `Doctor Note: ${doctor.name}`,
            summary: appt.consultationNotes,
            reference_id: appt.id,
            reference_type: 'appointment',
            doctor,
            details: {
              appointment_id: appt.id,
              notes: appt.consultationNotes,
              diagnosis: appt.diagnosis || null,
            },
          });
        }
      }

      // 2. Appointment Events (all appointments: scheduled, completed, cancelled, rescheduled)
      addEvent({
        id: `appointment-${appt.id}`,
        type: 'APPOINTMENT',
        occurred_at: toIsoString(appt.scheduledStart),
        title: appt.purpose || 'Doctor Appointment',
        summary: `Appointment with ${doctor.name} (${appt.status})`,
        reference_id: appt.id,
        reference_type: 'appointment',
        doctor,
        details: {
          appointment_id: appt.id,
          scheduled_start: toIsoString(appt.scheduledStart),
          scheduled_end: toIsoString(appt.scheduledEnd),
          status: appt.status,
          purpose: appt.purpose || null,
          visit_reason: appt.visitReason || null,
          reschedule_reason: appt.rescheduleReason || null,
          cancellation_reason: appt.cancellationReason || null,
        },
      });

      // 3. Follow-up Events (if purpose/visitReason indicates follow-up or scheduled in future)
      const isFollowUp =
        (appt.purpose && /follow[-_ ]?up/i.test(appt.purpose)) ||
        (appt.visitReason && /follow[-_ ]?up/i.test(appt.visitReason)) ||
        (appt.status === 'scheduled' &&
          new Date(appt.scheduledStart).getTime() > Date.now());

      if (isFollowUp) {
        addEvent({
          id: `followup-${appt.id}`,
          type: 'FOLLOW_UP',
          occurred_at: toIsoString(appt.scheduledStart),
          title: 'Follow-up Consultation',
          summary: `Follow-up appointment with ${doctor.name}`,
          reference_id: appt.id,
          reference_type: 'appointment',
          doctor,
          details: {
            appointment_id: appt.id,
            date: toDateKey(appt.scheduledStart),
            time: toIsoString(appt.scheduledStart).split('T')[1]?.slice(0, 5) || '',
            doctor: doctor.name,
            status: appt.status.toUpperCase(),
          },
        });
      }
    }

    // 4. Prescription Events & Medicine Lifecycle Events
    for (const rx of prescriptions) {
      const doctor: TimelineDoctorSummary = {
        id: rx.doctorId || 'dr-narendran',
        name: rx.doctorName
          ? `Dr. ${rx.doctorName.replace(/^Dr\.\s*/i, '')}`
          : 'Dr. S. Narendran',
        specialization: rx.doctorSpecialization || 'General Medicine',
      };

      const meds = medicinesByPrescription.get(rx.id) || [];
      const signedUrlVal = signedPrescriptionUrls.get(rx.id);

      addEvent({
        id: `prescription-${rx.id}`,
        type: 'PRESCRIPTION',
        occurred_at: toIsoString(rx.prescriptionDate || rx.createdAt),
        title: 'Prescription',
        summary:
          rx.additionalNotes ||
          `${meds.length} medication(s) prescribed by ${doctor.name}`,
        reference_id: rx.id,
        reference_type: 'prescription',
        doctor,
        details: {
          prescription_id: rx.id,
          prescription_date: toDateKey(rx.prescriptionDate),
          status: rx.status,
          additional_notes: rx.additionalNotes || null,
          medicine_count: meds.length,
          prescription_url: signedUrlVal || null,
          image_url: signedUrlVal || null,
          medicines: meds.map((m) => ({
            medicine_id: m.medicineId || m.id,
            name: m.medicineName,
            strength: m.strength || null,
            dosage: m.dosage || null,
            frequency: m.frequency || null,
            duration: m.duration || null,
            food_instruction: m.foodInstruction || null,
            instructions: m.instructions || null,
            prescribed_quantity: m.prescribedQuantity,
          })),
        },
      });

      // Medicine Started Events
      for (const med of meds) {
        addEvent({
          id: `medicine-start-${med.id}`,
          type: 'MEDICINE_STARTED',
          occurred_at: toIsoString(rx.prescriptionDate || rx.createdAt),
          title: `Medicine Started: ${med.medicineName}`,
          summary: [med.dosage, med.frequency, med.duration]
            .filter(Boolean)
            .join(' - ') || `Started taking ${med.medicineName}`,
          reference_id: med.id,
          reference_type: 'medicine',
          doctor,
          details: {
            medicine_id: med.medicineId || med.id,
            medicine_name: med.medicineName,
            strength: med.strength || null,
            dosage: med.dosage || null,
            frequency: med.frequency || null,
            duration: med.duration || null,
            food_instruction: med.foodInstruction || null,
            instructions: med.instructions || null,
            prescription_id: rx.id,
          },
        });
      }

      // If prescription is upload or has an attached document, also expose as MEDICAL_RECORD
      if (signedUrlVal || rx.prescriptionType === 'upload') {
        const title = rx.additionalNotes || 'Prescription Document';
        const isImaging = IMAGING_REGEX.test(title);

        addEvent({
          id: `medical-record-rx-${rx.id}`,
          type: isImaging ? 'IMAGING' : 'MEDICAL_RECORD',
          occurred_at: toIsoString(rx.prescriptionDate || rx.createdAt),
          title: isImaging ? `Imaging Document: ${title}` : title,
          summary: `Prescription record from ${doctor.name}`,
          reference_id: rx.id,
          reference_type: 'medical_record',
          doctor,
          details: {
            record_type: isImaging ? 'IMAGING' : 'PRESCRIPTION',
            document_name: 'Prescription Document',
            document_url: signedUrlVal || null,
            prescription_id: rx.id,
          },
        });
      }
    }

    // 5. Lab Test Ordered Events
    for (const plt of prescriptionLabTests) {
      const doctor: TimelineDoctorSummary = {
        id: plt.doctorId || 'dr-narendran',
        name: plt.doctorName
          ? `Dr. ${plt.doctorName.replace(/^Dr\.\s*/i, '')}`
          : 'Dr. S. Narendran',
        specialization: plt.doctorSpecialization || 'General Medicine',
      };

      const report = labReportsByTestId.get(plt.id);
      const isAvailable = Boolean(report);

      addEvent({
        id: `lab-test-${plt.id}`,
        type: 'LAB_TEST_ORDERED',
        occurred_at: toIsoString(plt.orderedDate || plt.createdAt),
        title: `Investigation: ${plt.testName}`,
        summary: plt.instructions || `${plt.testName} ordered by ${doctor.name}`,
        reference_id: plt.id,
        reference_type: 'lab_test',
        doctor,
        details: {
          test_id: plt.labTestId || plt.id,
          test_name: plt.testName,
          ordered_date: toDateKey(plt.orderedDate),
          instructions: plt.instructions || null,
          status: isAvailable ? 'REPORT_AVAILABLE' : 'AWAITING_RESULT',
          report_id: report ? report.id : null,
        },
      });
    }

    // 6. Lab Report Events & Medical Records / Imaging
    for (const report of labReports) {
      const signedUrlVal = signedReportUrls.get(report.id) || report.documentUrl;
      const testOrFileName = report.testName || report.fileName;
      const isImaging =
        IMAGING_REGEX.test(testOrFileName) ||
        IMAGING_REGEX.test(report.notes || '');

      addEvent({
        id: `lab-report-${report.id}`,
        type: 'LAB_REPORT',
        occurred_at: toIsoString(report.reportDate || report.createdAt),
        title: `Lab Report: ${testOrFileName}`,
        summary: report.notes || `Report file: ${report.fileName}`,
        reference_id: report.id,
        reference_type: 'lab_report',
        doctor: null,
        details: {
          report_id: report.id,
          test_name: testOrFileName,
          report_date: toDateKey(report.reportDate),
          file_name: report.fileName,
          file_type: report.fileType,
          file_size: report.fileSize,
          document_url: signedUrlVal,
          notes: report.notes || null,
          is_external: report.isExternal,
          status: 'REPORT_AVAILABLE',
        },
      });

      // Also expose as MEDICAL_RECORD / IMAGING
      addEvent({
        id: `medical-record-report-${report.id}`,
        type: isImaging ? 'IMAGING' : 'MEDICAL_RECORD',
        occurred_at: toIsoString(report.reportDate || report.createdAt),
        title: isImaging
          ? `Imaging: ${testOrFileName}`
          : `Medical Record: ${testOrFileName}`,
        summary: report.notes || `Uploaded report: ${report.fileName}`,
        reference_id: report.id,
        reference_type: 'medical_record',
        doctor: null,
        details: {
          record_type: isImaging ? 'IMAGING' : 'LAB_REPORT',
          document_name: report.fileName,
          document_url: signedUrlVal,
          file_type: report.fileType,
          file_size: report.fileSize,
          notes: report.notes || null,
        },
      });
    }

    // Sorting: Newest -> Oldest (occurred_at DESC), stable tie-breaker on id DESC
    events.sort((a, b) => {
      const timeDiff =
        new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    });

    // Filtering
    let filteredEvents = events;

    // Filter by type
    if (query.type && query.type !== 'ALL') {
      const filterType = query.type;
      filteredEvents = filteredEvents.filter((e) => {
        if (filterType === 'MEDICINE') {
          return (
            e.type === 'MEDICINE_STARTED' ||
            e.type === 'MEDICINE_CHANGED' ||
            e.type === 'MEDICINE_STOPPED'
          );
        }
        if (filterType === 'INVESTIGATION') {
          return e.type === 'LAB_TEST_ORDERED';
        }
        if (filterType === 'REPORT') {
          return e.type === 'LAB_REPORT';
        }
        return e.type === filterType;
      });
    }

    // Filter by date range (occurred_at date)
    if (query.from_date) {
      filteredEvents = filteredEvents.filter(
        (e) => toDateKey(e.occurred_at) >= query.from_date!,
      );
    }
    if (query.to_date) {
      filteredEvents = filteredEvents.filter(
        (e) => toDateKey(e.occurred_at) <= query.to_date!,
      );
    }

    // Pagination
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const total = filteredEvents.length;
    const startIndex = (page - 1) * limit;
    const paginatedTimeline = filteredEvents.slice(
      startIndex,
      startIndex + limit,
    );
    const hasNext = startIndex + limit < total;

    // Health Summary Calculation
    const completedConsultations = appointments.filter(
      (a) =>
        a.status === 'completed' ||
        Boolean(a.diagnosis) ||
        Boolean(a.consultationNotes),
    );

    const upcomingAppointments = appointments
      .filter(
        (a) =>
          a.status === 'scheduled' &&
          new Date(a.scheduledStart).getTime() >= Date.now(),
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledStart).getTime() -
          new Date(b.scheduledStart).getTime(),
      );

    const lastCompleted = completedConsultations[0];
    const upcomingFollowUp = upcomingAppointments[0];

    // Active conditions from diagnoses and basic_medical_info
    const basicMedical =
      typeof patientProfile?.basicMedicalInfo === 'object' &&
      patientProfile.basicMedicalInfo !== null
        ? (patientProfile.basicMedicalInfo as Record<string, unknown>)
        : {};

    const activeConditionsSet = new Set<string>();
    for (const a of completedConsultations) {
      if (a.diagnosis?.trim()) {
        activeConditionsSet.add(a.diagnosis.trim());
      }
    }

    const activeMedicationsSet = new Set<string>();
    const activePrescriptions = prescriptions.filter(
      (p) => p.status?.toLowerCase() === 'active',
    );
    for (const rx of activePrescriptions) {
      const rxMeds = medicinesByPrescription.get(rx.id) || [];
      for (const m of rxMeds) {
        if (m.medicineName?.trim()) {
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

    const activeConditions = Array.from(activeConditionsSet);
    const activeMedications = Array.from(activeMedicationsSet);
    const primaryCondition =
      activeConditions[0] ||
      (lastCompleted?.diagnosis ? lastCompleted.diagnosis : 'None reported');

    const summary: HealthSummary = {
      primary_condition: primaryCondition,
      active_conditions: activeConditions,
      active_medications: activeMedications,
      consultations_count: completedConsultations.length,
      prescriptions_count: prescriptions.length,
      investigations_count: prescriptionLabTests.length,
      medical_records_count:
        labReports.length +
        prescriptions.filter((p) => p.prescriptionUrl || p.imageUrl).length,
      last_consultation: lastCompleted
        ? {
            id: lastCompleted.id,
            date: toDateKey(lastCompleted.scheduledStart),
            doctor: lastCompleted.doctorName
              ? `Dr. ${lastCompleted.doctorName.replace(/^Dr\.\s*/i, '')}`
              : 'Dr. S. Narendran',
            diagnosis: lastCompleted.diagnosis || null,
          }
        : null,
      upcoming_follow_up: upcomingFollowUp
        ? {
            id: upcomingFollowUp.id,
            date: toDateKey(upcomingFollowUp.scheduledStart),
            time:
              toIsoString(upcomingFollowUp.scheduledStart)
                .split('T')[1]
                ?.slice(0, 5) || '',
            doctor: upcomingFollowUp.doctorName
              ? `Dr. ${upcomingFollowUp.doctorName.replace(/^Dr\.\s*/i, '')}`
              : 'Dr. S. Narendran',
            purpose: upcomingFollowUp.purpose || 'Follow-up Consultation',
          }
        : null,
    };

    const patientHeader: PatientTimelineHeader = {
      id: patientProfile?.id || primaryId,
      name: patientProfile?.name || 'Patient',
      age: calculateAge(patientProfile?.dateOfBirth),
      gender: patientProfile?.gender || null,
      phone: patientProfile?.phone || null,
      email: patientProfile?.email || null,
      blood_group: patientProfile?.bloodGroup || null,
    };

    return {
      patient: patientHeader,
      summary,
      timeline: paginatedTimeline,
      pagination: {
        page,
        limit,
        total,
        has_next: hasNext,
      },
    };
  }

  async getMedicalHistory(
    userId: string,
    query: GetMedicalTimelineQuery,
  ): Promise<MedicalHistoryResponse> {
    const { primaryId, allIds } = await repo.getPatientResolvedIds(userId);

    const [
      timelineData,
      summaryData,
      medicineSchedules,
      patientProfile,
    ] = await Promise.all([
      this.getMedicalTimeline(userId, query),
      medicalSummaryService.getSecondOpinionSummary(userId, {
        from_date: query.from_date,
        to_date: query.to_date,
      }),
      repo.getPatientMedicineSchedules(allIds),
      repo.getPatientProfile(allIds),
    ]);

    const adherenceList: MedicineAdherenceItem[] = medicineSchedules.map(
      (ms) => ({
        id: ms.id,
        medicine_name: ms.medicineName,
        scheduled_date: toDateKey(ms.scheduledDate),
        scheduled_time: ms.scheduledTime || null,
        dose_time_of_day: ms.doseTimeOfDay || null,
        status: ms.status,
        taken_at: ms.takenAt ? toIsoString(ms.takenAt) : null,
      }),
    );

    return {
      patient: {
        id: patientProfile?.id || primaryId,
        name: patientProfile?.name || 'Patient',
        date_of_birth: patientProfile?.dateOfBirth || null,
        age: calculateAge(patientProfile?.dateOfBirth),
        gender: patientProfile?.gender || null,
        blood_group: patientProfile?.bloodGroup || null,
      },
      summary: {
        active_conditions: timelineData.summary.active_conditions,
        active_medications: timelineData.summary.active_medications,
        allergies: summaryData.clinical_summary.allergies,
        important_alerts: summaryData.clinical_summary.important_alerts,
        last_consultation: timelineData.summary.last_consultation,
        upcoming_follow_up: timelineData.summary.upcoming_follow_up,
      },
      consultations: summaryData.consultations || [],
      diagnoses: summaryData.diagnoses || [],
      prescriptions: summaryData.prescriptions || [],
      medications: summaryData.medications || [],
      investigations: summaryData.investigations || [],
      medical_records: summaryData.medical_records || [],
      appointments: summaryData.appointments || [],
      medicine_adherence: adherenceList,
      timeline: timelineData.timeline,
      pagination: timelineData.pagination,
    };
  }
}

export const medicalTimelineService = new MedicalTimelineService();

