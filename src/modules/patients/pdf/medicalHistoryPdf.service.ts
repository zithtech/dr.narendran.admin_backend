import type { MedicalHistoryResponse } from '../medicalTimeline.types.js';
import { escapeHtml, formatDate, formatDateTime, htmlToPdfBuffer } from './pdf.helpers.js';
import { MEDICAL_PDF_STYLES } from './pdf.styles.js';

export class MedicalHistoryPdfService {
  /**
   * Generates a Complete Medical History PDF Buffer from structured DTO data.
   */
  public static async generatePdf(data: MedicalHistoryResponse): Promise<Buffer> {
    const html = this.buildHtml(data);
    return htmlToPdfBuffer(html);
  }

  /**
   * Builds the complete HTML string for the medical history document adhering to all 13 clinical sections.
   */
  public static buildHtml(data: MedicalHistoryResponse): string {
    const {
      patient,
      summary,
      consultations,
      diagnoses,
      prescriptions,
      medications,
      investigations,
      medical_records,
      appointments,
      medicine_adherence,
      timeline,
    } = data;

    const generatedAtStr = formatDateTime(new Date());

    // Calculate Medical History Period
    let historyPeriod = 'All Available History';
    if (timeline && timeline.length > 0) {
      const dates = timeline.map((t) => new Date(t.occurred_at).getTime()).filter((d) => !isNaN(d));
      if (dates.length > 0) {
        const earliest = new Date(Math.min(...dates));
        const latest = new Date(Math.max(...dates));
        historyPeriod = `${formatDate(earliest)} &ndash; ${formatDate(latest)}`;
      }
    }

    // Categorize Appendices
    const rxAppendix = prescriptions;
    const labAppendix = medical_records.filter((r) => r.record_type === 'LAB_REPORT' || r.record_type === 'REPORT');
    const imagingAppendix = medical_records.filter((r) => r.record_type === 'IMAGING');
    const dischargeAppendix = medical_records.filter((r) => r.record_type === 'DISCHARGE_SUMMARY' || /discharge/i.test(r.title));
    const otherAppendix = medical_records.filter(
      (r) =>
        r.record_type !== 'LAB_REPORT' &&
        r.record_type !== 'REPORT' &&
        r.record_type !== 'IMAGING' &&
        r.record_type !== 'DISCHARGE_SUMMARY' &&
        !/discharge/i.test(r.title),
    );

    // Calculate Adherence Summary by Medicine
    const adherenceByMed = new Map<string, { total: number; taken: number; earliest: string; latest: string }>();
    if (medicine_adherence && medicine_adherence.length > 0) {
      for (const log of medicine_adherence) {
        const medName = log.medicine_name || 'Prescribed Medicine';
        if (!adherenceByMed.has(medName)) {
          adherenceByMed.set(medName, {
            total: 0,
            taken: 0,
            earliest: log.scheduled_date,
            latest: log.scheduled_date,
          });
        }
        const record = adherenceByMed.get(medName)!;
        record.total += 1;
        if (log.status?.toUpperCase() === 'TAKEN') {
          record.taken += 1;
        }
        if (log.scheduled_date < record.earliest) record.earliest = log.scheduled_date;
        if (log.scheduled_date > record.latest) record.latest = log.scheduled_date;
      }
    }

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Patient Medical History - ${escapeHtml(patient.name)}</title>
  <style>
    ${MEDICAL_PDF_STYLES}
  </style>
</head>
<body>
  <div class="pdf-container">
    <!-- Header -->
    <header class="pdf-header">
      <div>
        <div class="brand-title">Dr. S. Narendran Care Center</div>
        <div class="brand-subtitle">Department of Clinical Oncology &amp; General Medicine</div>
      </div>
      <div class="doc-meta">
        <div class="doc-meta-title">MEDICAL HISTORY &amp; CLINICAL SUMMARY</div>
        <div>Generated: ${escapeHtml(generatedAtStr)}</div>
        <div>Purpose: Medical Consultation / Second Opinion</div>
        <div style="font-weight: 700; color: #b91c1c;">CONFIDENTIAL MEDICAL HANDOVER</div>
      </div>
    </header>

    <!-- 1. Patient Identification Card -->
    <div class="patient-card">
      <div class="patient-grid">
        <div>
          <div class="patient-field-label">Patient Full Name</div>
          <div class="patient-field-value">${escapeHtml(patient.name || 'N/A')}</div>
        </div>
        <div>
          <div class="patient-field-label">Patient ID</div>
          <div class="patient-field-value">${escapeHtml(patient.id ? patient.id.slice(0, 8).toUpperCase() : 'N/A')}</div>
        </div>
        <div>
          <div class="patient-field-label">Age / Gender</div>
          <div class="patient-field-value">${patient.age !== null && patient.age !== undefined ? `${patient.age} Yrs` : 'N/A'} / ${escapeHtml(patient.gender || 'N/A')}</div>
        </div>
        <div>
          <div class="patient-field-label">Date of Birth</div>
          <div class="patient-field-value">${formatDate(patient.date_of_birth)}</div>
        </div>
        <div>
          <div class="patient-field-label">Blood Group</div>
          <div class="patient-field-value">${escapeHtml(patient.blood_group || 'N/A')}</div>
        </div>
        <div>
          <div class="patient-field-label">Medical History Period</div>
          <div class="patient-field-value">${historyPeriod}</div>
        </div>
      </div>
    </div>

    <!-- 2. Clinical Summary -->
    <section class="pdf-section pdf-section-avoid-break">
      <div class="section-title">2. Clinical Summary</div>
      <div class="summary-box">
        <div style="margin-bottom: 6px;">
          <strong>Primary / Current Condition:</strong>
          <span style="font-size: 11pt; font-weight: 700; color: #0369a1; margin-left: 4px;">
            ${escapeHtml(diagnoses[0]?.diagnosis || summary.active_conditions[0] || 'Under clinical observation')}
          </span>
        </div>
        <div style="margin-bottom: 6px;">
          <strong>Active Diagnoses:</strong>
          ${
            summary.active_conditions && summary.active_conditions.length > 0
              ? summary.active_conditions.map((c) => `<span class="badge badge-info" style="margin-right: 4px;">${escapeHtml(c)}</span>`).join('')
              : '<span style="color:#64748b;">None documented</span>'
          }
        </div>
        <div style="margin-bottom: 6px;">
          <strong>Current Active Medications:</strong>
          ${
            summary.active_medications && summary.active_medications.length > 0
              ? summary.active_medications.map((m) => `<span class="badge badge-success" style="margin-right: 4px;">${escapeHtml(m)}</span>`).join('')
              : '<span style="color:#64748b;">None currently active</span>'
          }
        </div>
        ${
          summary.last_consultation
            ? `<div style="font-size: 9pt; color: #475569; margin-top: 4px;">
                 <strong>Recent Consultation:</strong> ${formatDate(summary.last_consultation['date'] as string)} with ${escapeHtml(String(summary.last_consultation['doctor'] || 'Physician'))}
                 ${summary.last_consultation['diagnosis'] ? `&bull; Assessment: <em>${escapeHtml(String(summary.last_consultation['diagnosis']))}</em>` : ''}
               </div>`
            : ''
        }
        ${
          summary.upcoming_follow_up
            ? `<div style="font-size: 9pt; color: #0284c7; margin-top: 3px; font-weight: 600;">
                 <strong>Upcoming Follow-Up:</strong> ${formatDate(summary.upcoming_follow_up['date'] as string)} (${escapeHtml(String(summary.upcoming_follow_up['purpose'] || 'Follow-up'))}) with ${escapeHtml(String(summary.upcoming_follow_up['doctor'] || 'Doctor'))}
               </div>`
            : ''
        }
      </div>

      ${
        summary.allergies && summary.allergies.length > 0
          ? `
        <div class="summary-alert-box">
          <strong>Known Drug &amp; Clinical Allergies:</strong>
          ${summary.allergies.map((a) => `<span class="badge badge-danger" style="margin-right: 4px;">${escapeHtml(a)}</span>`).join('')}
        </div>
      `
          : ''
      }
    </section>

    <!-- 3. Current Medications -->
    <section class="pdf-section">
      <div class="section-title">
        3. Current Medications
        <span class="section-badge">${medications.filter((m) => m.status.toLowerCase() === 'active').length} Active</span>
      </div>
      ${
        medications.length === 0
          ? '<div class="empty-state-text">No current medications documented in record.</div>'
          : `
        <table class="clinical-table">
          <thead>
            <tr>
              <th style="width: 25%;">Medicine Name</th>
              <th style="width: 14%;">Dosage</th>
              <th style="width: 16%;">Frequency</th>
              <th style="width: 15%;">Duration</th>
              <th style="width: 20%;">Instructions</th>
              <th style="width: 10%;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${medications
              .map(
                (m) => `
              <tr>
                <td><strong>${escapeHtml(m.name)}</strong></td>
                <td>${escapeHtml(m.dosage || '-')}</td>
                <td>${escapeHtml(m.frequency || '-')}</td>
                <td>${escapeHtml(m.duration || '-')}</td>
                <td>
                  ${escapeHtml(m.food_instruction || '')}
                  ${m.instructions ? `<div style="font-size: 8.5pt; color: #64748b;">${escapeHtml(m.instructions)}</div>` : ''}
                </td>
                <td>
                  <span class="badge ${m.status.toLowerCase() === 'active' ? 'badge-success' : 'badge-neutral'}">
                    ${escapeHtml(m.status)}
                  </span>
                </td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `
      }
    </section>

    <!-- 4. Medical Timeline -->
    <section class="pdf-section">
      <div class="section-title">
        4. Chronological Medical Timeline
        <span class="section-badge">${timeline.length} Events</span>
      </div>
      ${
        timeline.length === 0
          ? '<div class="empty-state-text">No timeline events recorded.</div>'
          : `
        <div>
          ${timeline
            .map(
              (event) => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-date">${formatDateTime(event.occurred_at)} &bull; <span class="badge badge-neutral">${escapeHtml(event.type)}</span></div>
              <div class="timeline-title">${escapeHtml(event.title)}</div>
              ${event.doctor ? `<div style="font-size: 9pt; color: #0284c7; font-weight: 600;">${escapeHtml(event.doctor.name)} (${escapeHtml(event.doctor.specialization)})</div>` : ''}
              <div class="timeline-desc">${escapeHtml(event.summary)}</div>
            </div>
          `,
            )
            .join('')}
        </div>
      `
      }
    </section>

    <!-- 5. Consultation History -->
    <section class="pdf-section">
      <div class="section-title">
        5. Consultation History
        <span class="section-badge">${consultations.length} Consultations</span>
      </div>
      ${
        consultations.length === 0
          ? '<div class="empty-state-text">No consultation records available.</div>'
          : `
        <div>
          ${consultations
            .map(
              (c) => `
            <div class="card-item">
              <div class="card-header-line">
                <span class="card-title">${formatDate(c.date)} &bull; ${escapeHtml(c.doctor?.name || 'Physician')}</span>
                <span class="badge badge-info">${escapeHtml(c.doctor?.specialization || 'Clinical Assessment')}</span>
              </div>
              ${c.purpose ? `<div class="card-subtitle"><strong>Reason for Visit:</strong> ${escapeHtml(c.purpose)}</div>` : ''}
              ${c.diagnosis ? `<div style="font-size: 9.5pt; color: #0369a1; font-weight: 600; margin-top: 3px;">Diagnosis: ${escapeHtml(c.diagnosis)}</div>` : ''}
              ${c.doctor_notes ? `<div class="card-body-text"><strong>Clinical Notes &amp; Plan:</strong> ${escapeHtml(c.doctor_notes)}</div>` : ''}
              ${c.advice ? `<div class="card-body-text" style="color: #0284c7;"><strong>Physician Advice:</strong> ${escapeHtml(c.advice)}</div>` : ''}
            </div>
          `,
            )
            .join('')}
        </div>
      `
      }
    </section>

    <!-- 6. Diagnosis History -->
    <section class="pdf-section">
      <div class="section-title">
        6. Diagnosis History
        <span class="section-badge">${diagnoses.length} Diagnoses</span>
      </div>
      ${
        diagnoses.length === 0
          ? '<div class="empty-state-text">No diagnosis records documented.</div>'
          : `
        <table class="clinical-table">
          <thead>
            <tr>
              <th style="width: 25%;">Diagnosis Date</th>
              <th style="width: 45%;">Condition / Diagnosis</th>
              <th style="width: 30%;">Diagnosing Physician</th>
            </tr>
          </thead>
          <tbody>
            ${diagnoses
              .map(
                (d) => `
              <tr>
                <td>${formatDate(d.diagnosed_date)}</td>
                <td><strong>${escapeHtml(d.diagnosis)}</strong></td>
                <td>${escapeHtml(d.doctor?.name || 'Dr. S. Narendran')}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `
      }
    </section>

    <!-- 7. Medication History -->
    <section class="pdf-section">
      <div class="section-title">
        7. Medication History &amp; Lifecycle
        <span class="section-badge">${medications.length} Medications</span>
      </div>
      ${
        medications.length === 0
          ? '<div class="empty-state-text">No medication history available.</div>'
          : `
        <table class="clinical-table">
          <thead>
            <tr>
              <th style="width: 28%;">Medicine</th>
              <th style="width: 14%;">Dose</th>
              <th style="width: 16%;">Frequency</th>
              <th style="width: 16%;">Start Date</th>
              <th style="width: 14%;">Status</th>
              <th style="width: 12%;">Prescribed By</th>
            </tr>
          </thead>
          <tbody>
            ${medications
              .map(
                (m) => `
              <tr>
                <td><strong>${escapeHtml(m.name)}</strong></td>
                <td>${escapeHtml(m.dosage || '-')}</td>
                <td>${escapeHtml(m.frequency || '-')}</td>
                <td>${formatDate(m.started_date)}</td>
                <td>
                  <span class="badge ${m.status.toLowerCase() === 'active' ? 'badge-success' : 'badge-neutral'}">
                    ${escapeHtml(m.status)}
                  </span>
                </td>
                <td>${escapeHtml(m.prescribed_by?.name || 'Dr. S. Narendran')}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `
      }
    </section>

    <!-- 8. Investigation History -->
    <section class="pdf-section">
      <div class="section-title">
        8. Investigation History
        <span class="section-badge">${investigations.length} Ordered</span>
      </div>

      <div style="font-size: 10pt; font-weight: 700; color: #334155; margin-bottom: 6px;">A. Investigations Ordered</div>
      ${
        investigations.length === 0
          ? '<div class="empty-state-text">No investigations ordered.</div>'
          : `
        <table class="clinical-table">
          <thead>
            <tr>
              <th style="width: 35%;">Test Name</th>
              <th style="width: 20%;">Ordered Date</th>
              <th style="width: 25%;">Ordered By</th>
              <th style="width: 20%;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${investigations
              .map(
                (inv) => `
              <tr>
                <td>
                  <strong>${escapeHtml(inv.test_name)}</strong>
                  ${inv.instructions ? `<div style="font-size: 8.5pt; color: #64748b;">${escapeHtml(inv.instructions)}</div>` : ''}
                </td>
                <td>${formatDate(inv.ordered_date)}</td>
                <td>${escapeHtml(inv.doctor?.name || 'Dr. S. Narendran')}</td>
                <td>
                  <span class="badge ${inv.status === 'REPORT_AVAILABLE' ? 'badge-success' : 'badge-warning'}">
                    ${escapeHtml(inv.status.replace(/_/g, ' '))}
                  </span>
                </td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `
      }

      <div style="font-size: 10pt; font-weight: 700; color: #334155; margin-top: 14px; margin-bottom: 6px;">B. Investigation Results &amp; Lab Reports</div>
      ${
        investigations.filter((i) => i.report).length === 0
          ? '<div class="empty-state-text">No lab report results archived.</div>'
          : `
        <table class="clinical-table">
          <thead>
            <tr>
              <th style="width: 35%;">Test / Parameter</th>
              <th style="width: 20%;">Report Date</th>
              <th style="width: 25%;">File / Result Reference</th>
              <th style="width: 20%;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${investigations
              .filter((i) => i.report)
              .map(
                (inv) => `
              <tr>
                <td><strong>${escapeHtml(inv.test_name)}</strong></td>
                <td>${formatDate(inv.report?.report_date)}</td>
                <td>${escapeHtml(inv.report?.file_name || 'Report Document')}</td>
                <td><span class="badge badge-success">Available</span></td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `
      }
    </section>

    <!-- 9. Medical Records / Documents -->
    <section class="pdf-section">
      <div class="section-title">
        9. Medical Records &amp; Document Registry
        <span class="section-badge">${medical_records.length} Documents</span>
      </div>
      ${
        medical_records.length === 0
          ? '<div class="empty-state-text">No uploaded medical records found.</div>'
          : `
        <table class="clinical-table">
          <thead>
            <tr>
              <th style="width: 35%;">Document Name</th>
              <th style="width: 20%;">Document Type</th>
              <th style="width: 20%;">Document Date</th>
              <th style="width: 25%;">Doctor / Hospital / Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${medical_records
              .map(
                (rec) => `
              <tr>
                <td><strong>${escapeHtml(rec.title || rec.file_name)}</strong></td>
                <td><span class="badge badge-info">${escapeHtml(rec.record_type)}</span></td>
                <td>${formatDate(rec.record_date)}</td>
                <td>${escapeHtml(rec.notes || 'Recorded in system')}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `
      }
    </section>

    <!-- 10. Appointment & Follow-Up History -->
    <section class="pdf-section">
      <div class="section-title">
        10. Appointment &amp; Follow-Up History
        <span class="section-badge">${appointments.length} Appointments</span>
      </div>
      ${
        appointments.length === 0
          ? '<div class="empty-state-text">No appointment history documented.</div>'
          : `
        <table class="clinical-table">
          <thead>
            <tr>
              <th style="width: 22%;">Scheduled Date</th>
              <th style="width: 30%;">Physician</th>
              <th style="width: 30%;">Purpose</th>
              <th style="width: 18%;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${appointments
              .map(
                (a) => `
              <tr>
                <td>${formatDate(a.date)} ${escapeHtml(a.time ? `(${a.time})` : '')}</td>
                <td>${escapeHtml(a.doctor?.name || 'Dr. S. Narendran')}</td>
                <td>${escapeHtml(a.purpose || 'Doctor Consultation')}</td>
                <td>
                  <span class="badge ${a.status.toLowerCase() === 'completed' ? 'badge-success' : a.status.toLowerCase() === 'scheduled' ? 'badge-info' : 'badge-neutral'}">
                    ${escapeHtml(a.status)}
                  </span>
                </td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `
      }
    </section>

    <!-- 11. Medication Adherence Summary -->
    ${
      adherenceByMed.size > 0
        ? `
      <section class="pdf-section pdf-section-avoid-break">
        <div class="section-title">11. Medication Adherence Summary</div>
        <table class="clinical-table">
          <thead>
            <tr>
              <th style="width: 35%;">Medicine Name</th>
              <th style="width: 25%;">Tracking Period</th>
              <th style="width: 20%;">Taken Compliance</th>
              <th style="width: 20%;">Missed / Skipped</th>
            </tr>
          </thead>
          <tbody>
            ${Array.from(adherenceByMed.entries())
              .map(([medName, stats]) => {
                const takenPct = Math.round((stats.taken / stats.total) * 100);
                const missedPct = 100 - takenPct;
                return `
                <tr>
                  <td><strong>${escapeHtml(medName)}</strong></td>
                  <td>${formatDate(stats.earliest)} &ndash; ${formatDate(stats.latest)}</td>
                  <td><span class="badge badge-success">${takenPct}% Taken</span> (${stats.taken}/${stats.total})</td>
                  <td><span class="badge ${missedPct > 20 ? 'badge-danger' : 'badge-neutral'}">${missedPct}% Missed</span></td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      </section>
    `
        : ''
    }

    <!-- 12. Current Status & Follow-Up Plan -->
    <section class="pdf-section pdf-section-avoid-break">
      <div class="section-title">12. Current Status &amp; Follow-Up Plan</div>
      <div class="summary-box" style="background-color: #f8fafc; border-color: #cbd5e1; border-left-color: #0284c7;">
        <div style="margin-bottom: 6px;">
          <strong>Active Clinical Conditions:</strong>
          ${
            summary.active_conditions && summary.active_conditions.length > 0
              ? summary.active_conditions.map((c) => `<span class="badge badge-info" style="margin-right: 4px;">${escapeHtml(c)}</span>`).join('')
              : '<span style="color:#64748b;">None documented</span>'
          }
        </div>
        <div style="margin-bottom: 6px;">
          <strong>Pending Diagnostic Investigations:</strong>
          ${
            investigations.filter((i) => i.status === 'AWAITING_RESULT').length > 0
              ? investigations.filter((i) => i.status === 'AWAITING_RESULT').map((i) => `<span class="badge badge-warning" style="margin-right: 4px;">${escapeHtml(i.test_name)}</span>`).join('')
              : '<span style="color:#15803d; font-size: 9pt;">All investigations reported &amp; up-to-date</span>'
          }
        </div>
        <div>
          <strong>Next Planned Review:</strong>
          ${
            summary.upcoming_follow_up
              ? `<span style="font-weight: 700; color: #0f172a;">${formatDate(summary.upcoming_follow_up['date'] as string)} with ${escapeHtml(String(summary.upcoming_follow_up['doctor'] || 'Doctor'))}</span>`
              : '<span style="color:#64748b;">To be scheduled on clinical necessity</span>'
          }
        </div>
      </div>
    </section>

    <!-- 13. Appendix -->
    <section class="pdf-section">
      <div class="section-title">13. Appendix &mdash; Original Medical Document References</div>
      <div style="margin-bottom: 8px;">
        <strong>Appendix A &mdash; Prescriptions:</strong> ${rxAppendix.length} document(s) referenced.
      </div>
      <div style="margin-bottom: 8px;">
        <strong>Appendix B &mdash; Laboratory Reports:</strong> ${labAppendix.length} document(s) referenced.
      </div>
      <div style="margin-bottom: 8px;">
        <strong>Appendix C &mdash; Imaging Reports:</strong> ${imagingAppendix.length} document(s) referenced.
      </div>
      <div style="margin-bottom: 8px;">
        <strong>Appendix D &mdash; Discharge Summaries:</strong> ${dischargeAppendix.length} document(s) referenced.
      </div>
      <div style="margin-bottom: 8px;">
        <strong>Appendix E &mdash; Other Medical Records:</strong> ${otherAppendix.length} document(s) referenced.
      </div>
    </section>

    <!-- Footer -->
    <footer class="pdf-footer">
      <div>Dr. S. Narendran Care Center &bull; Complete Longitudinal Medical History Report</div>
      <div>Confidential &bull; Generated for Clinical Consultation / Second Opinion</div>
    </footer>
  </div>
</body>
</html>
    `;
  }
}
