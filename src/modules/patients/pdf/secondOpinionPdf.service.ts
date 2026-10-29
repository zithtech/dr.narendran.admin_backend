import type { SecondOpinionSummaryResponse } from '../medicalTimeline.types.js';
import { escapeHtml, formatDate, formatDateTime, htmlToPdfBuffer } from './pdf.helpers.js';
import { MEDICAL_PDF_STYLES } from './pdf.styles.js';

export class SecondOpinionPdfService {
  /**
   * Generates a Second Opinion Medical Summary PDF Buffer from structured DTO data.
   */
  public static async generatePdf(data: SecondOpinionSummaryResponse): Promise<Buffer> {
    const html = this.buildHtml(data);
    return htmlToPdfBuffer(html);
  }

  /**
   * Builds the HTML string formatted for doctor second opinion review.
   */
  public static buildHtml(data: SecondOpinionSummaryResponse): string {
    const {
      patient,
      clinical_summary,
      consultations,
      diagnoses,
      prescriptions,
      medications,
      investigations,
      lab_reports,
      medical_records,
      current_status,
      recent_advice,
    } = data;

    const generatedAtStr = formatDateTime(new Date());

    // Calculate History Period
    const allDates: number[] = [];
    if (consultations) {
      for (const c of consultations) {
        const t = new Date(c.date).getTime();
        if (!isNaN(t)) allDates.push(t);
      }
    }
    if (prescriptions) {
      for (const p of prescriptions) {
        const t = new Date(p.date).getTime();
        if (!isNaN(t)) allDates.push(t);
      }
    }
    if (investigations) {
      for (const i of investigations) {
        const t = new Date(i.ordered_date).getTime();
        if (!isNaN(t)) allDates.push(t);
      }
    }

    let historyPeriod = 'Complete Record';
    if (allDates.length > 0) {
      const earliest = new Date(Math.min(...allDates));
      const latest = new Date(Math.max(...allDates));
      historyPeriod = `${formatDate(earliest)} &ndash; ${formatDate(latest)}`;
    }

    // Build Key Clinical Milestones / Important Clinical Events
    const milestones: Array<{ date: string; title: string; outcome: string }> = [];
    if (consultations && consultations.length > 0) {
      for (const c of consultations.slice(0, 4)) {
        milestones.push({
          date: c.date,
          title: `Consultation (${c.doctor?.name || 'Physician'})`,
          outcome: c.diagnosis || c.purpose || 'Clinical Review Completed',
        });
      }
    }
    if (investigations && investigations.length > 0) {
      for (const inv of investigations.slice(0, 3)) {
        milestones.push({
          date: inv.ordered_date,
          title: `Investigation: ${inv.test_name}`,
          outcome: inv.status === 'REPORT_AVAILABLE' ? 'Report Archived' : 'Awaiting Result',
        });
      }
    }
    milestones.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Second Opinion Medical Summary - ${escapeHtml(patient.name)}</title>
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
        <div class="brand-subtitle">Department of Clinical Oncology &amp; Multi-Disciplinary Care</div>
      </div>
      <div class="doc-meta">
        <div class="doc-meta-title">MEDICAL SECOND OPINION SUMMARY</div>
        <div>Generated: ${escapeHtml(generatedAtStr)}</div>
        <div style="font-weight: 700; color: #0284c7;">PHYSICIAN CLINICAL HANDOVER SUMMARY</div>
      </div>
    </header>

    <!-- Patient Information Card -->
    <div class="patient-card">
      <div class="patient-grid">
        <div>
          <div class="patient-field-label">Patient Name</div>
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
          <div class="patient-field-label">Blood Group / Vitals</div>
          <div class="patient-field-value">
            ${escapeHtml(patient.blood_group || 'N/A')} ${patient.weight_kg ? `&bull; ${patient.weight_kg} kg` : ''}
          </div>
        </div>
        <div>
          <div class="patient-field-label">Medical History Period</div>
          <div class="patient-field-value">${historyPeriod}</div>
        </div>
      </div>
    </div>

    <!-- 1. Executive Clinical Summary -->
    <section class="pdf-section pdf-section-avoid-break">
      <div class="section-title">1. Clinical Summary (Executive Overview)</div>
      <div class="summary-box">
        <div style="margin-bottom: 6px;">
          <strong>Primary Condition / Clinical Status:</strong>
          <span style="font-size: 11pt; font-weight: 700; color: #0369a1; margin-left: 4px;">
            ${escapeHtml(clinical_summary.primary_condition || 'Under medical assessment')}
          </span>
        </div>
        <div style="margin-bottom: 6px;">
          <strong>Current Treatment Strategy:</strong>
          <span style="color: #334155; margin-left: 4px;">
            ${escapeHtml(clinical_summary.current_treatment || 'Standard clinical maintenance care')}
          </span>
        </div>
        <div>
          <strong>Current Medications:</strong>
          ${
            clinical_summary.current_medications && clinical_summary.current_medications.length > 0
              ? clinical_summary.current_medications.map((m) => `<span class="badge badge-success" style="margin-right: 4px;">${escapeHtml(m)}</span>`).join('')
              : '<span style="color:#64748b;">None documented</span>'
          }
        </div>
      </div>

      ${
        clinical_summary.allergies && clinical_summary.allergies.length > 0
          ? `
        <div class="summary-alert-box">
          <strong>Known Drug / Clinical Allergies &amp; Alerts:</strong>
          ${clinical_summary.allergies.map((a) => `<span class="badge badge-danger" style="margin-right: 4px;">${escapeHtml(a)}</span>`).join('')}
        </div>
      `
          : ''
      }
    </section>

    <!-- 2. Recent Consultations & Clinical Notes -->
    ${
      consultations && consultations.length > 0
        ? `
      <section class="pdf-section">
        <div class="section-title">2. Recent Consultations &amp; Physician Notes</div>
        <div>
          ${consultations.slice(0, 5)
            .map(
              (c) => `
            <div class="card-item">
              <div class="card-header-line">
                <span class="card-title">${formatDate(c.date)} &bull; ${escapeHtml(c.doctor?.name || 'Physician')}</span>
                <span class="badge badge-info">${escapeHtml(c.doctor?.specialization || 'Clinical Assessment')}</span>
              </div>
              ${c.purpose ? `<div class="card-subtitle"><strong>Reason for Visit:</strong> ${escapeHtml(c.purpose)}</div>` : ''}
              ${c.diagnosis ? `<div style="font-size: 9.5pt; color: #0369a1; font-weight: 600; margin-top: 3px;">Diagnosis: ${escapeHtml(c.diagnosis)}</div>` : ''}
              ${c.doctor_notes ? `<div class="card-body-text"><strong>Physician Notes &amp; Assessment:</strong> ${escapeHtml(c.doctor_notes)}</div>` : ''}
              ${c.advice ? `<div class="card-body-text" style="color: #0284c7;"><strong>Treatment Plan / Advice:</strong> ${escapeHtml(c.advice)}</div>` : ''}
            </div>
          `,
            )
            .join('')}
        </div>
      </section>
    `
        : ''
    }

    <!-- 3. Active Diagnoses & History -->
    ${
      diagnoses && diagnoses.length > 0
        ? `
      <section class="pdf-section">
        <div class="section-title">3. Diagnosis History (Chronological)</div>
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
      </section>
    `
        : ''
    }

    <!-- 4. Current Medications & Treatment History -->
    ${
      medications && medications.length > 0
        ? `
      <section class="pdf-section">
        <div class="section-title">4. Treatment &amp; Current Medications</div>
        <table class="clinical-table">
          <thead>
            <tr>
              <th style="width: 25%;">Medication</th>
              <th style="width: 14%;">Dosage</th>
              <th style="width: 16%;">Frequency</th>
              <th style="width: 14%;">Started Date</th>
              <th style="width: 18%;">Instructions</th>
              <th style="width: 13%;">Status</th>
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
                <td>${escapeHtml(m.food_instruction || m.instructions || '-')}</td>
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
      </section>
    `
        : ''
    }

    <!-- 5. Investigations & Diagnostic Results -->
    ${
      (investigations && investigations.length > 0) || (lab_reports && lab_reports.length > 0)
        ? `
      <section class="pdf-section">
        <div class="section-title">5. Diagnostic Investigations &amp; Lab Results</div>
        <table class="clinical-table">
          <thead>
            <tr>
              <th style="width: 32%;">Investigation / Test</th>
              <th style="width: 18%;">Date</th>
              <th style="width: 22%;">Ordered By</th>
              <th style="width: 15%;">Status</th>
              <th style="width: 13%;">Report Ref</th>
            </tr>
          </thead>
          <tbody>
            ${(investigations || [])
              .map(
                (inv) => `
              <tr>
                <td><strong>${escapeHtml(inv.test_name)}</strong></td>
                <td>${formatDate(inv.ordered_date)}</td>
                <td>${escapeHtml(inv.doctor?.name || 'Physician')}</td>
                <td>
                  <span class="badge ${inv.status === 'REPORT_AVAILABLE' ? 'badge-success' : 'badge-warning'}">
                    ${escapeHtml(inv.status.replace(/_/g, ' '))}
                  </span>
                </td>
                <td>${inv.report ? 'Archived' : '-'}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </section>
    `
        : ''
    }

    <!-- 6. Important Clinical Events -->
    ${
      milestones.length > 0
        ? `
      <section class="pdf-section pdf-section-avoid-break">
        <div class="section-title">6. Important Clinical Events (Timeline Highlights)</div>
        <table class="clinical-table">
          <thead>
            <tr>
              <th style="width: 25%;">Date</th>
              <th style="width: 40%;">Clinical Milestone / Event</th>
              <th style="width: 35%;">Outcome / Findings</th>
            </tr>
          </thead>
          <tbody>
            ${milestones.slice(0, 6).map(
              (m) => `
              <tr>
                <td><strong>${formatDate(m.date)}</strong></td>
                <td>${escapeHtml(m.title)}</td>
                <td>${escapeHtml(m.outcome)}</td>
              </tr>
            `,
            ).join('')}
          </tbody>
        </table>
      </section>
    `
        : ''
    }

    <!-- 7. Current Clinical Status & Follow-Up -->
    <section class="pdf-section pdf-section-avoid-break">
      <div class="section-title">7. Current Status &amp; Next Steps</div>
      <div class="summary-box" style="background-color: #f8fafc; border-color: #cbd5e1; border-left-color: #0284c7;">
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 6px;">
          <div>
            <div class="patient-field-label">Last Clinical Visit</div>
            <div class="patient-field-value">${formatDate(current_status.last_visit_date)}</div>
          </div>
          <div>
            <div class="patient-field-label">Next Scheduled Follow-up</div>
            <div class="patient-field-value">${formatDate(current_status.next_appointment_date)}</div>
          </div>
          <div>
            <div class="patient-field-label">Medication Adherence</div>
            <div class="patient-field-value">${current_status.adherence_rate_pct !== null ? `${current_status.adherence_rate_pct}% Compliant` : 'N/A'}</div>
          </div>
        </div>
        ${
          recent_advice && recent_advice.length > 0
            ? `<div style="margin-top: 6px; font-size: 9pt; color: #334155;">
                 <strong>Latest Physician Advice:</strong> ${escapeHtml(recent_advice[0]?.advice)}
               </div>`
            : ''
        }
      </div>
    </section>

    <!-- 8. Document References -->
    ${
      medical_records && medical_records.length > 0
        ? `
      <section class="pdf-section pdf-section-avoid-break">
        <div class="section-title">8. Original Medical Document References</div>
        <table class="clinical-table">
          <thead>
            <tr>
              <th style="width: 45%;">Document Title</th>
              <th style="width: 25%;">Category</th>
              <th style="width: 30%;">Document Date</th>
            </tr>
          </thead>
          <tbody>
            ${medical_records.slice(0, 8).map(
              (rec) => `
              <tr>
                <td><strong>${escapeHtml(rec.title || rec.file_name)}</strong></td>
                <td><span class="badge badge-info">${escapeHtml(rec.record_type)}</span></td>
                <td>${formatDate(rec.record_date)}</td>
              </tr>
            `,
            ).join('')}
          </tbody>
        </table>
      </section>
    `
        : ''
    }

    <!-- Footer -->
    <footer class="pdf-footer">
      <div>Dr. S. Narendran Care Center &bull; Second Opinion Medical Summary &bull; Confidential</div>
      <div>Page 1 &bull; Doctor-to-Doctor Clinical Review</div>
    </footer>
  </div>
</body>
</html>
    `;
  }
}
