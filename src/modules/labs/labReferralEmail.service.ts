import nodemailer from 'nodemailer';
import { env } from '@/config/env.js';
import { logger } from '@/lib/logger.js';

export interface LabReferralEmailPayload {
  lab: {
    id: string;
    name: string;
    email: string;
    phone?: string | null | undefined;
    address?: string | null | undefined;
  };
  hospital: {
    name: string;
    address?: string | undefined;
    phone?: string | undefined;
    email?: string | undefined;
  };
  doctor: {
    name: string;
    qualification?: string | undefined;
    specialization?: string | undefined;
    medicalRegistrationNumber?: string | undefined;
    phone?: string | undefined;
  };
  patient: {
    name: string;
    patientId?: string | undefined;
    gender?: string | undefined;
    ageOrDob?: string | undefined;
    phone?: string | undefined;
  };
  prescription: {
    prescriptionId: string;
    prescriptionDate: string;
    diagnosis?: string | undefined;
    additionalNotes?: string | undefined;
    prescriptionUrl?: string | null | undefined;
  };
  recommendedTests: Array<{
    testName: string;
    instructions?: string | undefined;
  }>;
  pdfBuffer?: Buffer | undefined;
}

export class LabReferralEmailService {
  private static transporter = nodemailer.createTransport({
    host: env.SYSTEM_HOST,
    port: env.SYSTEM_PORT,
    secure: env.SYSTEM_SECURE,
    auth: {
      user: env.SYSTEM_EMAIL,
      pass: env.SYSTEM_APP_PASSWORD,
    },
  });

  /**
   * Generates a beautifully formatted, medical-grade HTML email for the diagnostic lab.
   */
  private static generateHtmlTemplate(
    data: LabReferralEmailPayload,
    accessiblePdfUrl?: string | null,
  ): string {
    const formattedDate = new Date(data.prescription.prescriptionDate).toLocaleDateString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      },
    );

    const testRows = data.recommendedTests
      .map(
        (test, idx) => `
        <tr style="border-bottom: 1px solid #E2E8F0; background-color: ${
          idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
        };">
          <td style="padding: 12px 14px; font-size: 14px; font-weight: bold; color: #0E8F6F; text-align: center; width: 40px;">
            ${idx + 1}
          </td>
          <td style="padding: 12px 14px; font-size: 14px; font-weight: 600; color: #1E293B;">
            ${test.testName}
          </td>
          <td style="padding: 12px 14px; font-size: 13px; color: #64748B;">
            ${test.instructions && test.instructions.trim().length > 0 ? test.instructions : 'Routine investigation'}
          </td>
        </tr>`,
      )
      .join('');

    const targetPdfUrl = accessiblePdfUrl || data.prescription.prescriptionUrl;
    const prescriptionLinkButton = targetPdfUrl
      ? `
      <div style="margin-top: 24px; text-align: center;">
        <a href="${targetPdfUrl}" target="_blank"
           style="background-color: #0E8F6F; color: #FFFFFF; font-weight: bold; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 8px; display: inline-block;">
          📄 View Digital Prescription PDF
        </a>
      </div>`
      : '';

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Patient Diagnostic Referral</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F1F5F9; padding: 30px 10px;">
        <tr>
          <td align="center">
            <table width="640" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #E2E8F0;">
              
              <!-- Hospital Branded Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #064E3B 0%, #0E8F6F 100%); padding: 26px 32px; color: #FFFFFF;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; background-color: rgba(255, 255, 255, 0.2); padding: 4px 10px; border-radius: 20px; font-weight: 600;">
                          Patient Diagnostic Referral
                        </span>
                        <h1 style="margin: 10px 0 4px 0; font-size: 22px; font-weight: 700; color: #FFFFFF;">
                          ${data.hospital.name}
                        </h1>
                        <p style="margin: 0; font-size: 13px; color: #A7F3D0;">
                          ${data.hospital.address ? data.hospital.address + ' • ' : ''}Phone: ${data.hospital.phone || 'N/A'}
                        </p>
                      </td>
                      <td align="right" valign="top" style="width: 120px;">
                        <span style="font-size: 12px; color: #D1FAE5; display: block;">Date:</span>
                        <span style="font-size: 14px; font-weight: bold; color: #FFFFFF;">${formattedDate}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Greeting & Referral Notice -->
              <tr>
                <td style="padding: 28px 32px 16px 32px;">
                  <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #0F172A;">
                    Dear ${data.lab.name} Team,
                  </p>
                  <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #475569;">
                    On behalf of <strong>${data.hospital.name}</strong>, we are referring the following patient to your diagnostic center for the laboratory investigations recommended in their medical consultation. Please process the tests as detailed below.
                  </p>
                </td>
              </tr>

              <!-- Patient & Doctor Details Grid -->
              <tr>
                <td style="padding: 10px 32px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden;">
                    <tr>
                      <!-- Patient Info -->
                      <td width="50%" valign="top" style="padding: 18px 20px; border-right: 1px solid #E2E8F0;">
                        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #0E8F6F; margin-bottom: 8px;">
                          👤 Patient Information
                        </div>
                        <div style="font-size: 16px; font-weight: 700; color: #0F172A; margin-bottom: 4px;">
                          ${data.patient.name}
                        </div>
                        <div style="font-size: 13px; color: #475569; margin-bottom: 3px;">
                          <strong>Patient ID:</strong> ${data.patient.patientId || 'N/A'}
                        </div>
                        <div style="font-size: 13px; color: #475569; margin-bottom: 3px;">
                          <strong>Gender / Age:</strong> ${data.patient.gender || 'N/A'}${data.patient.ageOrDob ? ' • ' + data.patient.ageOrDob : ''}
                        </div>
                        <div style="font-size: 13px; color: #475569;">
                          <strong>Contact:</strong> ${data.patient.phone || 'N/A'}
                        </div>
                      </td>

                      <!-- Doctor Info -->
                      <td width="50%" valign="top" style="padding: 18px 20px;">
                        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #0E8F6F; margin-bottom: 8px;">
                          🩺 Referring Physician
                        </div>
                        <div style="font-size: 15px; font-weight: 700; color: #0F172A; margin-bottom: 4px;">
                          Dr. ${data.doctor.name}
                        </div>
                        <div style="font-size: 13px; color: #475569; margin-bottom: 3px;">
                          ${data.doctor.qualification ? data.doctor.qualification + ' • ' : ''}${data.doctor.specialization || 'Consultant'}
                        </div>
                        ${
                          data.doctor.medicalRegistrationNumber
                            ? `<div style="font-size: 12px; color: #64748B; margin-bottom: 3px;"><strong>Reg No:</strong> ${data.doctor.medicalRegistrationNumber}</div>`
                            : ''
                        }
                        <div style="font-size: 13px; color: #475569;">
                          <strong>Hospital:</strong> ${data.hospital.name}
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Diagnosis / Remarks if present -->
              ${
                data.prescription.diagnosis
                  ? `
              <tr>
                <td style="padding: 8px 32px;">
                  <div style="background-color: #FEF3C7; border: 1px solid #FDE68A; border-radius: 8px; padding: 12px 16px;">
                    <strong style="color: #92400E; font-size: 13px;">Clinical Diagnosis / Notes:</strong>
                    <div style="color: #78350F; font-size: 13px; margin-top: 3px;">
                      ${data.prescription.diagnosis}
                    </div>
                  </div>
                </td>
              </tr>`
                  : ''
              }

              <!-- Recommended Lab Tests Section -->
              <tr>
                <td style="padding: 18px 32px 6px 32px;">
                  <h3 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px;">
                    🧪 Recommended Laboratory Tests (${data.recommendedTests.length})
                  </h3>
                  <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; border-collapse: collapse;">
                    <thead>
                      <tr style="background-color: #F8FAFC; border-bottom: 2px solid #E2E8F0;">
                        <th style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #475569; text-align: center;">#</th>
                        <th style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #475569; text-align: left;">Test / Investigation Name</th>
                        <th style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #475569; text-align: left;">Instructions / Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${testRows}
                    </tbody>
                  </table>
                  ${prescriptionLinkButton}
                </td>
              </tr>

              <!-- Important Instructions for the Lab -->
              <tr>
                <td style="padding: 24px 32px;">
                  <div style="background-color: #F1FBF5; border: 1px solid #C8E6C9; border-radius: 8px; padding: 14px 18px;">
                    <div style="font-size: 13px; font-weight: 700; color: #1E4620; margin-bottom: 4px;">
                      📋 Next Steps for Diagnostic Center:
                    </div>
                    <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #2D5A27; line-height: 1.6;">
                      <li>Please schedule or collect the requested samples when the patient visits.</li>
                      <li>Upon completion of test analyses, kindly upload or deliver the diagnostic report back to the patient and/or hospital records.</li>
                      <li>For any clinical clarifications regarding test parameters, please reach out to ${data.hospital.name} at ${data.hospital.phone || 'the hospital'}.</li>
                    </ul>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #F8FAFC; padding: 22px 32px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #64748B; text-align: center; line-height: 1.5;">
                  <p style="margin: 0 0 6px 0; font-weight: 600; color: #334155;">
                    ${data.hospital.name} • Clinical Referral Network
                  </p>
                  <p style="margin: 0 0 10px 0; font-size: 11px; color: #94A3B8;">
                    This is an automated clinical referral sent via the hospital prescription management system.
                  </p>
                  <p style="margin: 0; font-size: 11px; color: #94A3B8; font-style: italic;">
                    CONFIDENTIALITY NOTICE: This email and any attachments are intended solely for the use of the designated diagnostic center and may contain confidential medical information protected under healthcare privacy laws.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }

  /**
   * Generates a pre-signed, publicly accessible S3 URL valid for 7 days
   * to eliminate AWS S3 AccessDenied errors on private buckets.
   */
  private static async getAccessibleUrl(rawUrl?: string | null): Promise<string | null> {
    if (!rawUrl) return null;
    if (rawUrl.includes('amazonaws.com') && !rawUrl.includes('X-Amz-Signature')) {
      try {
        const { s3Service } = await import('@/modules/s3/s3.service.js');
        const parts = rawUrl.split('.amazonaws.com/');
        if (parts[1]) {
          const key = parts[1].split('?')[0];
          if (key) {
            // Sign URL for 7 days (604800 seconds, maximum supported by AWS SigV4)
            return await s3Service.getReadUrl(decodeURIComponent(key), 604800);
          }
        }
      } catch (e) {
        logger.warn({ err: e }, 'Failed to sign S3 URL for lab referral email');
      }
    }
    return rawUrl;
  }

  /**
   * Dispatches referral emails to every diagnostic lab assigned to recommended tests in the prescription.
   */
  public static async sendReferralEmail(data: LabReferralEmailPayload): Promise<boolean> {
    if (!data.lab.email || !data.lab.email.trim()) {
      logger.warn(
        { labId: data.lab.id, labName: data.lab.name },
        'Skipping lab referral email: no email address registered for this lab',
      );
      return false;
    }

    try {
      const subject = `[Patient Referral] Lab Investigation Request for ${data.patient.name} - ${data.hospital.name}`;
      
      // Ensure the URL is signed with AWS SigV4 (valid for 7 days) so the lab can access the PDF directly
      const accessiblePdfUrl = await this.getAccessibleUrl(data.prescription.prescriptionUrl);
      const htmlContent = this.generateHtmlTemplate(data, accessiblePdfUrl);

      const mailOptions: any = {
        from: `"${data.hospital.name}" <${env.SYSTEM_EMAIL}>`,
        to: data.lab.email.trim(),
        subject,
        html: htmlContent,
      };

      // Also attach the PDF buffer directly if available so the lab can view/print immediately from email
      if (data.pdfBuffer && Buffer.isBuffer(data.pdfBuffer)) {
        const cleanPatientName = data.patient.name.replace(/[^a-zA-Z0-9]/g, '_');
        mailOptions.attachments = [
          {
            filename: `Prescription_${cleanPatientName}.pdf`,
            content: data.pdfBuffer,
            contentType: 'application/pdf',
          },
        ];
      }

      const info = await this.transporter.sendMail(mailOptions);

      logger.info(
        {
          messageId: info.messageId,
          labId: data.lab.id,
          labEmail: data.lab.email,
          testCount: data.recommendedTests.length,
          patientName: data.patient.name,
          hasPdfAttachment: !!data.pdfBuffer,
        },
        'Successfully dispatched patient lab referral email to diagnostic center',
      );
      return true;
    } catch (err: any) {
      logger.error(
        {
          err: err?.message || err,
          labId: data.lab.id,
          labEmail: data.lab.email,
        },
        'Failed to send lab referral email via SMTP',
      );
      return false;
    }
  }
}
