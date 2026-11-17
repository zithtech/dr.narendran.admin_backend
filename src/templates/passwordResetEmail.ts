export interface PasswordResetEmailOptions {
  name?: string | null;
  resetUrl: string;
  expiresMinutes?: number;
}

/**
 * Generates an enterprise-grade, responsive HTML email template for password reset requests.
 * Compatible with major email clients (Gmail, Apple Mail, Outlook, mobile webviews).
 */
export function generatePasswordResetEmailHtml({
  name,
  resetUrl,
  expiresMinutes = 30,
}: PasswordResetEmailOptions): string {
  const recipientName = name && name.trim() ? name.trim() : 'Valued User';
  const currentYear = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Request - Dr. Narendran HMS</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 36px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container (max-width: 600px) -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Hospital Header with Gradient & Branding -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #0284c7 100%); padding: 32px 36px; text-align: left;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <!-- Pill Badge -->
                    <span style="display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; background-color: rgba(255, 255, 255, 0.16); color: #ffffff; padding: 4px 12px; border-radius: 9999px; font-weight: 700; margin-bottom: 12px;">
                      🔒 Security Notification
                    </span>
                    <h1 style="margin: 0 0 4px 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px;">
                      Dr. Narendran HMS
                    </h1>
                    <p style="margin: 0; font-size: 13px; color: #93c5fd; font-weight: 500;">
                      Clinical Management & Practitioner Portal
                    </p>
                  </td>
                  <td align="right" valign="top" style="width: 50px;">
                    <div style="width: 44px; height: 44px; background: rgba(255, 255, 255, 0.12); border-radius: 12px; text-align: center; line-height: 44px; font-size: 22px;">
                      🏥
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body Content -->
          <tr>
            <td style="padding: 36px 36px 28px 36px;">
              <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 700; color: #0f172a;">
                Password Reset Request
              </h2>
              
              <p style="margin: 0 0 14px 0; font-size: 14.5px; line-height: 1.6; color: #334155;">
                Hello <strong>${recipientName}</strong>,
              </p>
              
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                We received a request to reset your password for your <strong>Dr. Narendran HMS</strong> account. Click the secure button below to set a new password:
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0 28px 0;">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="border-radius: 10px; background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%); box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);">
                          <a href="${resetUrl}" target="_blank" style="display: inline-block; padding: 14px 34px; font-size: 14.5px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px; letter-spacing: 0.2px;">
                            Reset My Password &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Expiry & Security Notice Card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" style="width: 24px; padding-top: 2px;">
                          <span style="font-size: 16px;">⏱️</span>
                        </td>
                        <td style="padding-left: 10px;">
                          <p style="margin: 0 0 4px 0; font-size: 12.5px; font-weight: 700; color: #0f172a;">
                            Time-Limited Security Link
                          </p>
                          <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #64748b;">
                            This link is valid for <strong>${expiresMinutes} minutes</strong> and can only be used once. Any previously requested reset links for this account have been automatically invalidated.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Fallback Direct URL Box -->
              <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px;">
                <p style="margin: 0 0 6px 0; font-size: 11.5px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
                  If the button above does not work, copy and paste this link into your browser:
                </p>
                <p style="margin: 0; font-size: 11.5px; line-height: 1.4; color: #2563eb; word-break: break-all;">
                  <a href="${resetUrl}" style="color: #2563eb; text-decoration: underline;">${resetUrl}</a>
                </p>
              </div>

              <!-- Did not request notice -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #f1f5f9; padding-top: 20px;">
                <tr>
                  <td valign="top" style="width: 22px; padding-top: 2px;">
                    <span style="font-size: 14px;">🛡️</span>
                  </td>
                  <td style="padding-left: 8px;">
                    <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #64748b;">
                      <strong>Did not request this change?</strong> You can safely ignore this email. Your account password will remain unchanged and your account remains completely secure.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Professional Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 36px; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #334155;">
                Dr. Narendran Hospital Management System
              </p>
              <p style="margin: 0 0 10px 0; font-size: 11px; line-height: 1.5; color: #94a3b8;">
                Advanced Oncology, Cardiology & Multi-Specialty Clinical Platform
              </p>
              <p style="margin: 0; font-size: 10.5px; line-height: 1.4; color: #94a3b8;">
                This is an automated security transmission. Please do not reply directly to this email.<br/>
                &copy; ${currentYear} Dr. Narendran HMS. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Plain-text fallback for email clients that do not support HTML rendering.
 */
export function generatePasswordResetEmailText({
  name,
  resetUrl,
  expiresMinutes = 30,
}: PasswordResetEmailOptions): string {
  const recipientName = name && name.trim() ? name.trim() : 'Valued User';

  return `Password Reset Request - Dr. Narendran HMS

Hello ${recipientName},

We received a request to reset your password for your Dr. Narendran HMS account.
Click or copy the link below into your browser to set a new password:

${resetUrl}

This link is valid for ${expiresMinutes} minutes and can only be used once. Any previously requested reset links for this account have been automatically invalidated.

If you did not request this password reset, you can safely ignore this email. Your password will remain unchanged and your account remains secure.

--
Dr. Narendran Hospital Management System
Advanced Oncology, Cardiology & Multi-Specialty Clinical Platform
`;
}
