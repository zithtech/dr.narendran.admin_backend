import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add terms columns to doctors table
  pgm.sql(`
    ALTER TABLE doctors
    ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS terms_version VARCHAR(50);
  `);

  // Create audit table for terms acceptances
  pgm.createTable('doctor_terms_acceptances', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    doctor_id: {
      type: 'uuid',
      references: '"doctors"',
      onDelete: 'CASCADE',
    },
    user_account_id: { type: 'uuid' },
    terms_version: { type: 'varchar(50)', notNull: true },
    privacy_version: { type: 'varchar(50)', notNull: true, default: 'v1.0' },
    accepted_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    ip_address: { type: 'varchar(100)' },
    user_agent: { type: 'text' },
  });

  pgm.createIndex('doctor_terms_acceptances', ['doctor_id', 'terms_version']);

  // Reviewed Indian Telemedicine & Digital Healthcare Terms and Privacy Policy (v1.0)
  const reviewedTerms = `# Terms and Conditions for Medical Practitioners (v1.0)

Last Updated: October 2026

Welcome to the Doctor Portal of Dr. Narendran Clinic & Healthcare Services ("Platform"). These Terms and Conditions ("Terms") form a legally binding agreement between you, a licensed registered medical practitioner ("Practitioner", "Doctor", "you"), and Dr. Narendran Clinic ("Clinic", "we", "us", "our").

By registering, logging in, accessing, or utilizing this Platform, you acknowledge that you have carefully read, understood, and agreed to be bound by these Terms and our accompanying Privacy Policy.

---

### 1. Professional Qualifications & Legal Standing
1.1. You warrant and represent that you are a Registered Medical Practitioner (RMP) possessing a recognized medical degree (MBBS/MD/MS or equivalent recognized by the National Medical Commission / Medical Council of India or relevant State Medical Council).
1.2. You hold an active, valid medical registration number and practice license with the appropriate statutory medical council.
1.3. You agree to promptly notify the Clinic administration of any disciplinary proceedings, suspension, license revocation, or statutory limitations placed upon your right to practice medicine.

---

### 2. Standard of Care & Clinical Autonomy
2.1. The Platform provides digital management tools, appointment workflows, electronic health records (EHR), and prescription facilities. Nothing in this Platform interferes with or overrides your independent clinical judgment.
2.2. You are solely responsible for all diagnosis, clinical advice, differential assessments, prescription choices, dosages, and treatment protocols administered to patients.
2.3. In providing teleconsultations or video/audio assessments, you agree to adhere strictly to the **Telemedicine Practice Guidelines (2020)** issued under the National Medical Commission Act, 2019.
2.4. When evaluating a patient remotely, you shall determine whether a physical, in-person examination or emergency intervention is medically warranted. If in-person care is necessary, you agree to promptly advise the patient to visit a local clinic or emergency department.

---

### 3. Electronic Prescriptions & Pharmacy Orders
3.1. All e-prescriptions generated via this Platform must comply with the Drugs and Cosmetics Act, 1940, and the Drugs and Cosmetics Rules, 1945.
3.2. Each e-prescription shall clearly specify your name, qualifications, registration number, patient identification, clinical diagnosis or complaints, drug brand/generic name, strength, dosage form, frequency, duration of administration, and instructions.
3.3. Under no circumstances shall you prescribe prohibited medications via digital teleconsultation, including but not limited to Schedule X controlled substances, habit-forming psychotropic substances, or prohibited injectable medications unless compliant with statutory schedules.
3.4. Any pharmacy forwards, lab diagnostic requests, or home medicine delivery orders placed through the Platform are subject to patient consent and verification by a registered pharmacist.

---

### 4. Patient Confidentiality & Medical Records
4.1. You acknowledge that all patient health data, diagnostic reports, vitals, and consultation notes constitute sensitive personal data and Protected Health Information (PHI).
4.2. You agree to maintain strict medical confidentiality in accordance with the Indian Medical Council (Professional Conduct, Etiquette and Ethics) Regulations, 2002, and the Digital Personal Data Protection Act (DPDPA), 2023.
4.3. You shall not download, duplicate, distribute, or screenshot patient identifiable records for non-clinical or unauthorized commercial purposes.
4.4. Patient records created on this Platform are retained in accordance with statutory medical record retention obligations (minimum 3 years or as prescribed by local health regulations).

---

### 5. Account Security & Verification
5.1. Your account access is personal to you. You shall not share your login credentials, OTP codes, or security tokens with any unauthorized third party.
5.2. You are responsible for all clinical actions, orders, and communications transmitted using your credentials.
5.3. If you suspect any breach of your account or unauthorized access, you must notify technical support immediately at support@drnarendran.com.

---

### 6. Limitation of Liability
6.1. The Platform and its software services are provided on an "as is" and "as available" basis. While we strive for continuous uptime and strict data integrity, we do not warrant that transmission will be uninterrupted or error-free during teleconsultations.
6.2. The Clinic and platform operators shall not be liable for clinical malpractice, misdiagnosis, adverse drug reactions, or failure to diagnose resulting from practitioner decisions.

---

### 7. Amendments & Renewed Acceptance
7.1. We reserve the right to revise these Terms in accordance with statutory updates or platform feature evolutions.
7.2. Material updates will require renewed review and electronic acceptance upon your next login before accessing clinical workflows.

For any queries regarding these Terms, contact legal@drnarendran.com.`;

  const reviewedPrivacy = `# Privacy Policy for Medical Practitioners (v1.0)

Last Updated: October 2026

Dr. Narendran Clinic & Healthcare Services ("Clinic", "we", "us", "our") is committed to protecting the privacy, security, and integrity of your personal, credential, and professional data as a Medical Practitioner ("you", "Doctor"). This Privacy Policy explains our practices regarding data collection, processing, encryption, and your statutory rights under the **Digital Personal Data Protection Act (DPDPA), 2023** and applicable healthcare privacy regulations.

---

### 1. Information We Collect
1.1. **Professional Credentials**: Full name, qualifications, medical council registration number, state of medical registration, specialty, clinical experience years, and digital signature / clinic letterhead assets.
1.2. **Contact & Authentication Information**: Mobile phone number, verified email address, clinic address, and session authentication tokens.
1.3. **Clinical Operational Data**: Consultation appointment schedules, attendance logs, electronic prescriptions generated, diagnostic lab orders, patient chat transcripts, and audit timestamps.
1.4. **Technical & Telemetry Data**: Device model, operating system version, IP address, login timestamps, and application performance crash reports.

---

### 2. Purpose & Legal Basis for Processing
We process your data strictly for legitimate clinical, administrative, and statutory purposes:
- Verifying your medical council credentials and authorization to issue electronic prescriptions.
- Facilitating teleconsultations, audio/video appointments, and secure messaging with registered patients.
- Maintaining statutory medical audit logs in accordance with the National Medical Commission standards.
- Ensuring secure multi-factor authentication (OTP verification) and preventing identity fraud.

---

### 3. Data Protection & Encryption Architecture
3.1. **Encryption Standards**: All sensitive data is encrypted using industry-standard **AES-256** encryption at rest. All network communications are encrypted in transit using **TLS 1.3**.
3.2. **Role-Based Access Control (RBAC)**: Access to clinical databases is strictly segregated. Only authenticated clinical personnel assigned to specific patient appointments can view protected health information.
3.3. **Infrastructure Security**: Our servers are hosted in ISO 27001-certified and HIPAA-compliant data centers with 24/7 monitoring, automated firewall protection, and regular vulnerability assessments.

---

### 4. Data Sharing & Third Parties
4.1. We **never** sell, monetize, or rent your professional or contact data to commercial advertisers or pharmaceutical marketing companies.
4.2. We share information only with:
- **Verified Patients**: Who book appointments with you (displaying your professional name, specialty, qualifications, and clinic location).
- **Authorized Diagnostic Labs & Pharmacies**: Strictly to process lab referrals and prescription fulfillment authorized by you.
- **Law Enforcement & Statutory Authorities**: Only when mandated by a court order, summons, or applicable public health statutory directive.

---

### 5. Data Retention & Your Rights
5.1. **Retention**: Your profile and clinical audit records are retained for the duration of your active affiliation with the Clinic and for the statutory minimum period required by medical recordkeeping laws.
5.2. **Your Rights**: Under DPDPA 2023, you have the right to review your registered profile details, request corrections of inaccuracies, and obtain a summary of personal data held by us.

---

### 6. Contact Information & Data Protection Officer
If you have any questions, privacy concerns, or data requests, please contact our Data Protection Officer:
- **Email**: privacy@drnarendran.com / support@drnarendran.com
- **Clinic Address**: Dr. Narendran Clinic, Medical Administration Office.`;

  // Update legal_documents table with the reviewed legal content
  pgm.sql(`
    INSERT INTO legal_documents (type, content)
    VALUES 
      ('TERMS', $terms$${reviewedTerms}$terms$),
      ('PRIVACY', $privacy$${reviewedPrivacy}$privacy$)
    ON CONFLICT (type) DO UPDATE SET 
      content = EXCLUDED.content,
      updated_at = NOW();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('doctor_terms_acceptances');
  pgm.sql(`
    ALTER TABLE doctors
    DROP COLUMN IF EXISTS terms_accepted,
    DROP COLUMN IF EXISTS terms_accepted_at,
    DROP COLUMN IF EXISTS terms_version;
  `);
}
