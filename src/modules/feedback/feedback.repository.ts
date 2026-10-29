import { pool } from '@/db/pool.js';
import { ConflictError } from '@/http/errors.js';

import type {
  FeedbackAnswer,
  FeedbackAnswerInput,
  FeedbackForm,
  FeedbackQuestion,
  FeedbackStage,
  FeedbackSubmission,
  OptionItem,
  ScoringConfig,
  ValidationRules,
} from './feedback.types.js';

interface RawFormRow {
  id: string;
  form_name: string;
  stage: FeedbackStage;
  description: string | null;
  version: number;
  is_active: boolean;
  treatment_category: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RawQuestionRow {
  id: string;
  form_id: string;
  comparison_key: string | null;
  question_text: string;
  description: string | null;
  question_type: FeedbackQuestion['questionType'];
  options: OptionItem[] | null;
  is_required: boolean;
  display_order: number;
  validation_rules: ValidationRules | null;
  scoring_config: ScoringConfig | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RawSubmissionRow {
  id: string;
  patient_id: string;
  appointment_id: string;
  treatment_id: string | null;
  stage: FeedbackStage;
  form_id: string;
  form_version: number;
  status: FeedbackSubmission['status'];
  started_at: Date | string;
  submitted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RawAnswerRow {
  id: string;
  submission_id: string;
  question_id: string;
  comparison_key: string | null;
  question_text: string;
  question_type: FeedbackQuestion['questionType'];
  answer_value: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AppointmentRecord {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string | null;
  doctorSpecialty: string | null;
  patientName: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  purpose: string | null;
  status: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolvePatientIds(
  userId: string,
): Promise<{ primaryPatientId: string; allIds: string[] }> {
  const ids = new Set<string>();
  if (UUID_REGEX.test(userId)) {
    ids.add(userId);
  }

  try {
    const { rows } = await pool.query<{
      id: string;
      user_account_id: string | null;
      user_id: string | null;
    }>(
      `SELECT id, user_account_id, user_id
       FROM patients
       WHERE id::text = $1 OR user_account_id::text = $1 OR user_id::text = $1
       LIMIT 1`,
      [userId],
    );

    if (rows[0]) {
      if (rows[0].id) ids.add(rows[0].id);
      if (rows[0].user_account_id) ids.add(rows[0].user_account_id);
      if (rows[0].user_id) ids.add(rows[0].user_id);
      return {
        primaryPatientId: rows[0].id,
        allIds: Array.from(ids),
      };
    }
  } catch {
    // If patients lookup fails, fall back to userId
  }

  return {
    primaryPatientId: userId,
    allIds: Array.from(ids),
  };
}

export async function getActiveFormByStage(
  stage: FeedbackStage,
  treatmentCategory?: string,
): Promise<FeedbackForm | null> {
  const query = `
    SELECT *
    FROM feedback_forms
    WHERE stage = $1
      AND is_active = true
      ${treatmentCategory ? 'AND (treatment_category = $2 OR treatment_category IS NULL)' : ''}
    ORDER BY version DESC
    LIMIT 1;
  `;
  const params = treatmentCategory ? [stage, treatmentCategory] : [stage];
  const { rows } = await pool.query<RawFormRow>(query, params);

  const formRow = rows[0];
  if (!formRow) return null;

  const questions = await getQuestionsByFormId(formRow.id);

  return {
    id: formRow.id,
    formName: formRow.form_name,
    stage: formRow.stage,
    description: formRow.description,
    version: formRow.version,
    isActive: formRow.is_active,
    treatmentCategory: formRow.treatment_category,
    questions,
    createdAt: new Date(formRow.created_at).toISOString(),
    updatedAt: new Date(formRow.updated_at).toISOString(),
  };
}

export async function getQuestionsByFormId(
  formId: string,
): Promise<FeedbackQuestion[]> {
  const query = `
    SELECT *
    FROM feedback_questions
    WHERE form_id = $1 AND is_active = true
    ORDER BY display_order ASC;
  `;
  const { rows } = await pool.query<RawQuestionRow>(query, [formId]);

  return rows.map((r) => ({
    id: r.id,
    formId: r.form_id,
    comparisonKey: r.comparison_key,
    questionText: r.question_text,
    description: r.description,
    questionType: r.question_type,
    options: r.options,
    isRequired: r.is_required,
    displayOrder: r.display_order,
    validationRules: r.validation_rules,
    scoringConfig: r.scoring_config,
    isActive: r.is_active,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

export async function getAppointmentById(
  appointmentId: string,
): Promise<AppointmentRecord | null> {
  const query = `
    SELECT 
      a.id,
      COALESCE(a.patient_id, a.id) as "patientId",
      a.doctor_id as "doctorId",
      d.name as "doctorName",
      d.specialization as "doctorSpecialty",
      COALESCE(p.name, a.patient_name) as "patientName",
      a.scheduled_start as "scheduledStart",
      a.scheduled_end as "scheduledEnd",
      a.purpose,
      a.status
    FROM appointments a
    LEFT JOIN doctors d ON (a.doctor_id = d.user_account_id OR a.doctor_id = d.id)
    LEFT JOIN patients p ON (a.patient_id = p.id OR a.patient_id = p.user_account_id OR a.patient_id = p.user_id)
    WHERE a.id = $1
    LIMIT 1;
  `;
  const { rows } = await pool.query<{
    id: string;
    patientId: string;
    doctorId: string;
    doctorName: string | null;
    doctorSpecialty: string | null;
    patientName: string | null;
    scheduledStart: Date | string;
    scheduledEnd: Date | string;
    purpose: string | null;
    status: string;
  }>(query, [appointmentId]);

  const r = rows[0];
  if (!r) return null;

  return {
    id: r.id,
    patientId: r.patientId,
    doctorId: r.doctorId,
    doctorName: r.doctorName,
    doctorSpecialty: r.doctorSpecialty,
    patientName: r.patientName,
    scheduledStart: new Date(r.scheduledStart).toISOString(),
    scheduledEnd: new Date(r.scheduledEnd).toISOString(),
    purpose: r.purpose,
    status: r.status,
  };
}

export async function getPatientAppointmentsWithFeedback(
  patientIds: string[],
): Promise<
  {
    appointment: AppointmentRecord;
    preStatus: 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED';
    postStatus: 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED';
  }[]
> {
  const query = `
    SELECT 
      a.id,
      a.patient_id as "patientId",
      a.doctor_id as "doctorId",
      d.name as "doctorName",
      d.specialization as "doctorSpecialty",
      COALESCE(p.name, a.patient_name) as "patientName",
      a.scheduled_start as "scheduledStart",
      a.scheduled_end as "scheduledEnd",
      a.purpose,
      a.status,
      sub_pre.status as "preStatus",
      sub_post.status as "postStatus"
    FROM appointments a
    LEFT JOIN doctors d ON (a.doctor_id = d.user_account_id OR a.doctor_id = d.id)
    LEFT JOIN patients p ON (a.patient_id = p.id OR a.patient_id = p.user_account_id OR a.patient_id = p.user_id)
    LEFT JOIN feedback_submissions sub_pre 
      ON (sub_pre.appointment_id = a.id AND sub_pre.stage = 'PRE_TREATMENT')
    LEFT JOIN feedback_submissions sub_post 
      ON (sub_post.appointment_id = a.id AND sub_post.stage = 'POST_TREATMENT')
    WHERE a.patient_id = ANY($1::uuid[])
    ORDER BY a.scheduled_start DESC;
  `;

  const { rows } = await pool.query<{
    id: string;
    patientId: string;
    doctorId: string;
    doctorName: string | null;
    doctorSpecialty: string | null;
    patientName: string | null;
    scheduledStart: Date | string;
    scheduledEnd: Date | string;
    purpose: string | null;
    status: string;
    preStatus: 'DRAFT' | 'SUBMITTED' | null;
    postStatus: 'DRAFT' | 'SUBMITTED' | null;
  }>(query, [patientIds]);

  return rows.map((r) => ({
    appointment: {
      id: r.id,
      patientId: r.patientId,
      doctorId: r.doctorId,
      doctorName: r.doctorName,
      doctorSpecialty: r.doctorSpecialty,
      patientName: r.patientName,
      scheduledStart: new Date(r.scheduledStart).toISOString(),
      scheduledEnd: new Date(r.scheduledEnd).toISOString(),
      purpose: r.purpose,
      status: r.status,
    },
    preStatus: r.preStatus ?? 'NOT_STARTED',
    postStatus: r.postStatus ?? 'NOT_STARTED',
  }));
}

export async function getSubmissionByAppointmentAndStage(
  appointmentId: string,
  stage: FeedbackStage,
): Promise<FeedbackSubmission | null> {
  const subQuery = `
    SELECT *
    FROM feedback_submissions
    WHERE appointment_id = $1 AND stage = $2
    LIMIT 1;
  `;
  const { rows } = await pool.query<RawSubmissionRow>(subQuery, [
    appointmentId,
    stage,
  ]);
  const sub = rows[0];
  if (!sub) return null;

  const answers = await getAnswersForSubmission(sub.id);

  return {
    id: sub.id,
    patientId: sub.patient_id,
    appointmentId: sub.appointment_id,
    treatmentId: sub.treatment_id,
    stage: sub.stage,
    formId: sub.form_id,
    formVersion: sub.form_version,
    status: sub.status,
    startedAt: new Date(sub.started_at).toISOString(),
    submittedAt: sub.submitted_at
      ? new Date(sub.submitted_at).toISOString()
      : null,
    createdAt: new Date(sub.created_at).toISOString(),
    updatedAt: new Date(sub.updated_at).toISOString(),
    answers,
  };
}

export async function getAnswersForSubmission(
  submissionId: string,
): Promise<FeedbackAnswer[]> {
  const ansQuery = `
    SELECT 
      a.id,
      a.submission_id,
      a.question_id,
      q.comparison_key,
      q.question_text,
      q.question_type,
      a.answer_value,
      a.created_at,
      a.updated_at
    FROM feedback_answers a
    JOIN feedback_questions q ON a.question_id = q.id
    WHERE a.submission_id = $1
    ORDER BY q.display_order ASC;
  `;
  const { rows } = await pool.query<RawAnswerRow>(ansQuery, [submissionId]);

  return rows.map((r) => ({
    id: r.id,
    submissionId: r.submission_id,
    questionId: r.question_id,
    comparisonKey: r.comparison_key,
    questionText: r.question_text,
    questionType: r.question_type,
    answerValue: r.answer_value,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

export async function saveDraft(
  patientId: string,
  appointmentId: string,
  stage: FeedbackStage,
  formId: string,
  formVersion: number,
  treatmentId?: string,
  answers: FeedbackAnswerInput[] = [],
): Promise<FeedbackSubmission> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check existing submission
    const existingRes = await client.query<RawSubmissionRow>(
      `SELECT * FROM feedback_submissions 
       WHERE appointment_id = $1 AND stage = $2
       FOR UPDATE;`,
      [appointmentId, stage],
    );

    const existing = existingRes.rows[0];
    if (existing?.status === 'SUBMITTED') {
      throw new ConflictError(
        'This assessment has already been submitted and cannot be modified.',
      );
    }

    let submissionId: string;
    if (existing) {
      submissionId = existing.id;
      await client.query(
        `UPDATE feedback_submissions
         SET treatment_id = COALESCE($1, treatment_id),
             updated_at = NOW()
         WHERE id = $2;`,
        [treatmentId || null, submissionId],
      );
    } else {
      const insertRes = await client.query<{ id: string }>(
        `INSERT INTO feedback_submissions 
           (patient_id, appointment_id, treatment_id, stage, form_id, form_version, status, started_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', NOW())
         RETURNING id;`,
        [
          patientId,
          appointmentId,
          treatmentId || null,
          stage,
          formId,
          formVersion,
        ],
      );
      submissionId = insertRes.rows[0]!.id;
    }

    // Save or update answers
    for (const ans of answers) {
      await client.query(
        `INSERT INTO feedback_answers (submission_id, question_id, answer_value, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (submission_id, question_id)
         DO UPDATE SET answer_value = EXCLUDED.answer_value, updated_at = NOW();`,
        [submissionId, ans.questionId, JSON.stringify(ans.answerValue)],
      );
    }

    await client.query('COMMIT');

    const updated = await getSubmissionByAppointmentAndStage(
      appointmentId,
      stage,
    );
    return updated!;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function submitFeedback(
  patientId: string,
  appointmentId: string,
  stage: FeedbackStage,
  formId: string,
  formVersion: number,
  treatmentId?: string,
  answers: FeedbackAnswerInput[] = [],
): Promise<FeedbackSubmission> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingRes = await client.query<RawSubmissionRow>(
      `SELECT * FROM feedback_submissions 
       WHERE appointment_id = $1 AND stage = $2
       FOR UPDATE;`,
      [appointmentId, stage],
    );

    const existing = existingRes.rows[0];
    if (existing?.status === 'SUBMITTED') {
      throw new ConflictError(
        'This assessment has already been submitted and cannot be submitted again.',
      );
    }

    let submissionId: string;
    if (existing) {
      submissionId = existing.id;
      await client.query(
        `UPDATE feedback_submissions
         SET status = 'SUBMITTED',
             submitted_at = NOW(),
             treatment_id = COALESCE($1, treatment_id),
             updated_at = NOW()
         WHERE id = $2;`,
        [treatmentId || null, submissionId],
      );
    } else {
      const insertRes = await client.query<{ id: string }>(
        `INSERT INTO feedback_submissions 
           (patient_id, appointment_id, treatment_id, stage, form_id, form_version, status, started_at, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'SUBMITTED', NOW(), NOW())
         RETURNING id;`,
        [
          patientId,
          appointmentId,
          treatmentId || null,
          stage,
          formId,
          formVersion,
        ],
      );
      submissionId = insertRes.rows[0]!.id;
    }

    // Insert or update answers
    for (const ans of answers) {
      await client.query(
        `INSERT INTO feedback_answers (submission_id, question_id, answer_value, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (submission_id, question_id)
         DO UPDATE SET answer_value = EXCLUDED.answer_value, updated_at = NOW();`,
        [submissionId, ans.questionId, JSON.stringify(ans.answerValue)],
      );
    }

    await client.query('COMMIT');

    const updated = await getSubmissionByAppointmentAndStage(
      appointmentId,
      stage,
    );
    return updated!;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getReportSnapshot(
  appointmentId: string,
  reportVersion = 1,
): Promise<unknown> {
  const query = `
    SELECT report_data
    FROM feedback_report_snapshots
    WHERE appointment_id = $1 AND report_version = $2
    LIMIT 1;
  `;
  const { rows } = await pool.query<{ report_data: unknown }>(query, [
    appointmentId,
    reportVersion,
  ]);
  return rows[0]?.report_data ?? null;
}


export async function saveReportSnapshot(
  patientId: string,
  appointmentId: string,
  preSubmissionId: string | null,
  postSubmissionId: string | null,
  reportData: unknown,
  reportVersion = 1,
): Promise<void> {
  const query = `
    INSERT INTO feedback_report_snapshots 
      (patient_id, appointment_id, pre_submission_id, post_submission_id, report_data, report_version, generated_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    ON CONFLICT (appointment_id, report_version)
    DO UPDATE SET 
      pre_submission_id = EXCLUDED.pre_submission_id,
      post_submission_id = EXCLUDED.post_submission_id,
      report_data = EXCLUDED.report_data,
      generated_at = NOW(),
      updated_at = NOW();
  `;
  await pool.query(query, [
    patientId,
    appointmentId,
    preSubmissionId,
    postSubmissionId,
    JSON.stringify(reportData),
    reportVersion,
  ]);
}
