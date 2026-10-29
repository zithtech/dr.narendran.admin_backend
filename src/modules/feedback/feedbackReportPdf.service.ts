import { escapeHtml, formatDate, formatDateTime, htmlToPdfBuffer } from '@/modules/patients/pdf/pdf.helpers.js';

import type { ConsultationOutcomeReport } from './feedback.types.js';

export class FeedbackReportPdfService {
  static async generateReportPdf(report: ConsultationOutcomeReport): Promise<Buffer> {
    const html = this.renderHtml(report);
    return htmlToPdfBuffer(html);
  }

  private static renderHtml(report: ConsultationOutcomeReport): string {
    const { appointment, preTreatment, postTreatment, comparisons, followUpConcerns } =
      report;

    const doctorName = escapeHtml(appointment.doctor.name || 'Treating Physician');
    const doctorSpecialty = escapeHtml(appointment.doctor.specialty || 'General Practitioner');
    const patientName = escapeHtml(appointment.patient.name || 'Patient');
    const appointmentDate = formatDate(appointment.scheduledStart);
    const purpose = escapeHtml(appointment.purpose || 'General Consultation');

    const comparisonsRows = comparisons
      .map((c) => {
        let badgeClass = 'badge-neutral';
        let label = 'No Change';

        if (c.interpretation === 'PATIENT_REPORTED_IMPROVEMENT') {
          badgeClass = 'badge-success';
          label = 'Improvement';
        } else if (c.interpretation === 'PATIENT_REPORTED_WORSENING') {
          badgeClass = 'badge-danger';
          label = 'Worsened';
        }

        const changeStr =
          c.change !== null
            ? (c.change > 0 ? `+${c.change}` : `${c.change}`)
            : '—';

        return `
          <tr>
            <td>
              <div class="metric-title">${escapeHtml(c.questionText)}</div>
              <div class="metric-sub">${escapeHtml(c.comparisonKey)}</div>
            </td>
            <td class="text-center">${escapeHtml(String(c.preTreatmentValue))}</td>
            <td class="text-center">${escapeHtml(String(c.postTreatmentValue))}</td>
            <td class="text-center font-bold">${changeStr}</td>
            <td class="text-center">
              <span class="badge ${badgeClass}">${label}</span>
            </td>
          </tr>
        `;
      })
      .join('');

    const concernsList =
      followUpConcerns.length > 0
        ? `
        <div class="alert-box alert-warning">
          <div class="alert-header">Clinical Attention / Follow-up Flags</div>
          <ul>
            ${followUpConcerns.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}
          </ul>
        </div>
      `
        : `
        <div class="alert-box alert-success">
          <div class="alert-header">Patient Reported Recovery</div>
          <p>No acute side effects or critical recovery concerns were flagged by the patient.</p>
        </div>
      `;

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Consultation Outcome & Feedback Report</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            background: #ffffff;
            padding: 24px;
            font-size: 13px;
            line-height: 1.5;
          }
          .header {
            border-bottom: 2px solid #0284c7;
            padding-bottom: 14px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .clinic-name {
            font-size: 20px;
            font-weight: 700;
            color: #0369a1;
          }
          .clinic-sub {
            color: #64748b;
            font-size: 11px;
          }
          .report-title-badge {
            background: #e0f2fe;
            color: #0369a1;
            padding: 6px 12px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 12px;
          }
          .grid-2 {
            display: flex;
            gap: 16px;
            margin-bottom: 20px;
          }
          .card {
            flex: 1;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 16px;
            background: #f8fafc;
          }
          .card-title {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
            font-weight: 700;
            margin-bottom: 8px;
          }
          .meta-row {
            margin-bottom: 4px;
          }
          .meta-label {
            font-weight: 600;
            color: #334155;
          }
          .section-title {
            font-size: 14px;
            font-weight: 700;
            color: #0f172a;
            margin: 20px 0 10px 0;
            border-left: 3px solid #0284c7;
            padding-left: 8px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th {
            background: #f1f5f9;
            color: #475569;
            font-weight: 600;
            text-align: left;
            padding: 8px 12px;
            font-size: 12px;
            border-bottom: 1px solid #cbd5e1;
          }
          td {
            padding: 8px 12px;
            border-bottom: 1px solid #f1f5f9;
            vertical-align: middle;
          }
          .text-center { text-align: center; }
          .font-bold { font-weight: 700; }
          .metric-title { font-weight: 600; color: #1e293b; }
          .metric-sub { font-size: 10px; color: #94a3b8; }
          .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
          }
          .badge-success { background: #dcfce7; color: #15803d; }
          .badge-danger { background: #fee2e2; color: #b91c1c; }
          .badge-neutral { background: #f1f5f9; color: #475569; }
          .alert-box {
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 20px;
          }
          .alert-warning {
            background: #fef3c7;
            border: 1px solid #fde68a;
            color: #92400e;
          }
          .alert-success {
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            color: #166534;
          }
          .alert-header {
            font-weight: 700;
            margin-bottom: 6px;
          }
          ul {
            margin-left: 20px;
          }
          .disclaimer {
            margin-top: 30px;
            border-top: 1px dashed #cbd5e1;
            padding-top: 10px;
            font-size: 10px;
            color: #64748b;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="clinic-name">Dr. Narendran Medical Centre</div>
            <div class="clinic-sub">Clinical Outcome & Patient Feedback Report</div>
          </div>
          <div class="report-title-badge">
            ${report.comparisonPending ? 'STATUS: PENDING ASSESSMENT' : 'STATUS: COMPARISON COMPLETE'}
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-title">Patient Details</div>
            <div class="meta-row"><span class="meta-label">Name:</span> ${patientName}</div>
            <div class="meta-row"><span class="meta-label">Consultation ID:</span> ${appointment.id.slice(0, 8)}</div>
            <div class="meta-row"><span class="meta-label">Visit Purpose:</span> ${purpose}</div>
          </div>
          <div class="card">
            <div class="card-title">Attending Clinician & Date</div>
            <div class="meta-row"><span class="meta-label">Doctor:</span> ${doctorName}</div>
            <div class="meta-row"><span class="meta-label">Specialty:</span> ${doctorSpecialty}</div>
            <div class="meta-row"><span class="meta-label">Appointment Date:</span> ${appointmentDate}</div>
          </div>
        </div>

        <div class="section-title">Assessment Timeline</div>
        <div class="grid-2">
          <div class="card">
            <div class="card-title">Pre-Treatment Baseline</div>
            <div class="meta-row"><span class="meta-label">Status:</span> ${preTreatment.status}</div>
            <div class="meta-row"><span class="meta-label">Submitted:</span> ${formatDateTime(preTreatment.submittedAt)}</div>
          </div>
          <div class="card">
            <div class="card-title">Post-Treatment Assessment</div>
            <div class="meta-row"><span class="meta-label">Status:</span> ${postTreatment.status}</div>
            <div class="meta-row"><span class="meta-label">Submitted:</span> ${formatDateTime(postTreatment.submittedAt)}</div>
          </div>
        </div>

        ${concernsList}

        <div class="section-title">Before & After Question Comparison</div>
        ${
          comparisons.length > 0
            ? `
          <table>
            <thead>
              <tr>
                <th style="width: 45%;">Question / Metric</th>
                <th class="text-center" style="width: 12%;">Pre-Treatment</th>
                <th class="text-center" style="width: 12%;">Post-Treatment</th>
                <th class="text-center" style="width: 12%;">Change</th>
                <th class="text-center" style="width: 19%;">Outcome</th>
              </tr>
            </thead>
            <tbody>
              ${comparisonsRows}
            </tbody>
          </table>
        `
            : `<p style="color: #64748b; padding: 12px 0;">${escapeHtml(report.comparisonMessage || 'Comparative assessment data not available.')}</p>`
        }

        <div class="disclaimer">
          This document compiles patient-reported outcomes (PROMs) comparing baseline and post-consultation feedback.
          Calculated differences reflect subjective patient impressions and are intended to assist clinical review, not replace formal medical evaluation.
          Report Generated: ${formatDateTime(report.reportGeneratedAt)}
        </div>
      </body>
      </html>
    `;
  }
}
