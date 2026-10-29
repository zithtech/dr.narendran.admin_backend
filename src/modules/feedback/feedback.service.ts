import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/http/errors.js';

import * as repo from './feedback.repository.js';
import type {
  ComparisonInterpretation,
  ComparisonItem,
  ConsultationOutcomeReport,
  EligibleConsultation,
  FeedbackAnswer,
  FeedbackAnswerInput,
  FeedbackForm,
  FeedbackQuestion,
  FeedbackStage,
  FeedbackSubmission,
} from './feedback.types.js';

export class FeedbackService {
  /**
   * Retrieves all consultations for the authenticated patient with their feedback eligibility and statuses.
   */
  async getEligibleConsultations(userId: string): Promise<EligibleConsultation[]> {
    const { allIds } = await repo.resolvePatientIds(userId);
    const records = await repo.getPatientAppointmentsWithFeedback(allIds);

    return records.map(({ appointment, preStatus, postStatus }) => {
      const isCompleted = appointment.status === 'completed';
      const isCancelled =
        appointment.status === 'cancelled' || appointment.status === 'no_show';
      const isBooked = ['scheduled', 'confirmed', 'rescheduled'].includes(
        appointment.status,
      );

      // Pre-treatment is eligible if the appointment is active and not cancelled.
      const isPreTreatmentEligible = isBooked && !isCancelled;

      // Post-treatment is eligible strictly after consultation is marked completed.
      const isPostTreatmentEligible = isCompleted && !isCancelled;

      const isComparisonReportAvailable =
        preStatus === 'SUBMITTED' && postStatus === 'SUBMITTED';

      return {
        consultationId: appointment.id,
        doctorId: appointment.doctorId,
        doctorName: appointment.doctorName,
        doctorSpecialty: appointment.doctorSpecialty,
        scheduledStart: appointment.scheduledStart,
        scheduledEnd: appointment.scheduledEnd,
        purpose: appointment.purpose,
        status: appointment.status,
        isPreTreatmentEligible,
        isPostTreatmentEligible,
        preTreatmentStatus: preStatus,
        postTreatmentStatus: postStatus,
        isComparisonReportAvailable,
      };
    });
  }

  /**
   * Returns active form definition and ordered questions for a stage.
   */
  async getForm(
    stage: FeedbackStage,
    treatmentCategory?: string,
  ): Promise<FeedbackForm> {
    const form = await repo.getActiveFormByStage(stage, treatmentCategory);
    if (!form) {
      throw new NotFoundError(`Active feedback form for stage '${stage}'`);
    }
    return form;
  }

  /**
   * Authorizes access to a consultation based on role.
   */
  private async authorizeConsultationAccess(
    appointmentId: string,
    userId: string,
    userRole: string,
  ): Promise<repo.AppointmentRecord> {
    const appt = await repo.getAppointmentById(appointmentId);
    if (!appt) {
      throw new NotFoundError('Consultation / Appointment');
    }

    if (userRole === 'admin') {
      return appt;
    }

    if (userRole === 'doctor') {
      if (appt.doctorId !== userId) {
        throw new ForbiddenError(
          'You are not authorized to view feedback for this consultation.',
        );
      }
      return appt;
    }

    // Patient role
    const { allIds } = await repo.resolvePatientIds(userId);
    if (!allIds.includes(appt.patientId) && !allIds.includes(appt.id)) {
      throw new ForbiddenError(
        'You do not have access to feedback for this consultation.',
      );
    }

    return appt;
  }

  /**
   * Returns existing draft or submitted assessment for a consultation stage.
   */
  async getSubmissionOrDraft(
    userId: string,
    appointmentId: string,
    stage: FeedbackStage,
    userRole: string,
  ): Promise<FeedbackSubmission | null> {
    await this.authorizeConsultationAccess(appointmentId, userId, userRole);
    return repo.getSubmissionByAppointmentAndStage(appointmentId, stage);
  }

  /**
   * Validates answers against active form questions.
   */
  private validateAnswersAgainstForm(
    questions: FeedbackQuestion[],
    answers: FeedbackAnswerInput[],
    isFinalSubmission: boolean,
  ): void {
    const questionMap = new Map<string, FeedbackQuestion>();
    for (const q of questions) {
      questionMap.set(q.id, q);
    }

    const providedQuestionIds = new Set<string>();

    for (const ans of answers) {
      const q = questionMap.get(ans.questionId);
      if (!q) {
        throw new ValidationError(
          `Question ID '${ans.questionId}' does not belong to the active form.`,
        );
      }
      providedQuestionIds.add(ans.questionId);

      // Validate answer value if provided
      if (ans.answerValue !== null && ans.answerValue !== undefined && ans.answerValue !== '') {
        this.validateSingleAnswer(q, ans.answerValue);
      }
    }

    // If final submission, enforce required questions
    if (isFinalSubmission) {
      for (const q of questions) {
        if (q.isRequired && !providedQuestionIds.has(q.id)) {
          throw new ValidationError(
            `Missing required answer for question: "${q.questionText}"`,
          );
        }
      }
    }
  }

  /**
   * Validates a single answer according to question type and validation rules.
   */
  private validateSingleAnswer(q: FeedbackQuestion, value: unknown): void {
    switch (q.questionType) {
      case 'RATING_SCALE':
      case 'NUMERIC': {
        const num = Number(value);
        if (isNaN(num)) {
          throw new ValidationError(
            `Answer for "${q.questionText}" must be a valid number.`,
          );
        }
        if (q.validationRules?.min !== undefined && num < q.validationRules.min) {
          throw new ValidationError(
            `Answer for "${q.questionText}" must be at least ${q.validationRules.min}.`,
          );
        }
        if (q.validationRules?.max !== undefined && num > q.validationRules.max) {
          throw new ValidationError(
            `Answer for "${q.questionText}" must be at most ${q.validationRules.max}.`,
          );
        }
        break;
      }

      case 'SINGLE_CHOICE': {
        if (q.options && q.options.length > 0) {
          const validValues = q.options.map((opt) => String(opt.value));
          if (!validValues.includes(String(value))) {
            throw new ValidationError(
              `Invalid option selected for "${q.questionText}".`,
            );
          }
        }
        break;
      }

      case 'MULTIPLE_CHOICE': {
        if (!Array.isArray(value)) {
          throw new ValidationError(
            `Answer for "${q.questionText}" must be an array of selected options.`,
          );
        }
        if (q.options && q.options.length > 0) {
          const validValues = new Set(q.options.map((opt) => String(opt.value)));
          for (const item of value) {
            if (!validValues.has(String(item))) {
              throw new ValidationError(
                `Invalid option '${String(item)}' selected for "${q.questionText}".`,
              );
            }
          }
        }
        break;
      }

      case 'BOOLEAN': {
        if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
          throw new ValidationError(
            `Answer for "${q.questionText}" must be a boolean (true or false).`,
          );
        }
        break;
      }

      case 'SHORT_TEXT':
      case 'LONG_TEXT': {
        if (typeof value !== 'string') {
          throw new ValidationError(
            `Answer for "${q.questionText}" must be text.`,
          );
        }
        if (
          q.validationRules?.minLength !== undefined &&
          value.length < q.validationRules.minLength
        ) {
          throw new ValidationError(
            `Answer for "${q.questionText}" must be at least ${q.validationRules.minLength} characters.`,
          );
        }
        if (
          q.validationRules?.maxLength !== undefined &&
          value.length > q.validationRules.maxLength
        ) {
          throw new ValidationError(
            `Answer for "${q.questionText}" cannot exceed ${q.validationRules.maxLength} characters.`,
          );
        }
        break;
      }

      case 'DATE': {
        const d = new Date(String(value));
        if (isNaN(d.getTime())) {
          throw new ValidationError(
            `Answer for "${q.questionText}" must be a valid date.`,
          );
        }
        break;
      }
    }
  }

  /**
   * Saves or resumes a draft feedback assessment.
   */
  async saveDraft(
    userId: string,
    appointmentId: string,
    stage: FeedbackStage,
    answers: FeedbackAnswerInput[],
    treatmentId?: string,
  ): Promise<FeedbackSubmission> {
    const appt = await this.authorizeConsultationAccess(
      appointmentId,
      userId,
      'patient',
    );

    // Lifecycle check
    if (stage === 'POST_TREATMENT' && appt.status !== 'completed') {
      throw new ValidationError(
        'Post-treatment assessment draft is only available once consultation is completed.',
      );
    }
    if (appt.status === 'cancelled' || appt.status === 'no_show') {
      throw new ValidationError(
        'Feedback assessments cannot be created for cancelled or no-show appointments.',
      );
    }

    const form = await this.getForm(stage);
    this.validateAnswersAgainstForm(form.questions, answers, false);

    const { primaryPatientId } = await repo.resolvePatientIds(userId);

    return repo.saveDraft(
      primaryPatientId,
      appointmentId,
      stage,
      form.id,
      form.version,
      treatmentId,
      answers,
    );
  }

  /**
   * Submits a completed feedback assessment transactionally.
   */
  async submitFeedback(
    userId: string,
    appointmentId: string,
    stage: FeedbackStage,
    answers: FeedbackAnswerInput[],
    treatmentId?: string,
  ): Promise<FeedbackSubmission> {
    const appt = await this.authorizeConsultationAccess(
      appointmentId,
      userId,
      'patient',
    );

    // Lifecycle check
    if (stage === 'POST_TREATMENT' && appt.status !== 'completed') {
      throw new ValidationError(
        'Post-treatment assessment can only be submitted after consultation is marked complete.',
      );
    }
    if (appt.status === 'cancelled' || appt.status === 'no_show') {
      throw new ValidationError(
        'Feedback assessments cannot be submitted for cancelled or no-show appointments.',
      );
    }

    const form = await this.getForm(stage);
    this.validateAnswersAgainstForm(form.questions, answers, true);

    const { primaryPatientId } = await repo.resolvePatientIds(userId);

    const submission = await repo.submitFeedback(
      primaryPatientId,
      appointmentId,
      stage,
      form.id,
      form.version,
      treatmentId,
      answers,
    );

    // Check if both assessments are now submitted, generate & persist report snapshot
    try {
      const preSub = await repo.getSubmissionByAppointmentAndStage(
        appointmentId,
        'PRE_TREATMENT',
      );
      const postSub = await repo.getSubmissionByAppointmentAndStage(
        appointmentId,
        'POST_TREATMENT',
      );

      if (preSub?.status === 'SUBMITTED' && postSub?.status === 'SUBMITTED') {
        const report = this.buildComparisonReport(appt, preSub, postSub);
        await repo.saveReportSnapshot(
          primaryPatientId,
          appointmentId,
          preSub.id,
          postSub.id,
          report,
          1,
        );
      }
    } catch {
      // Non-blocking report snapshot persistence
    }

    return submission;
  }

  /**
   * Retrieves feedback history for both stages for an authorized user.
   */
  async getFeedbackHistory(
    userId: string,
    appointmentId: string,
    userRole: string,
  ): Promise<{
    consultationId: string;
    preTreatment: FeedbackSubmission | null;
    postTreatment: FeedbackSubmission | null;
  }> {
    await this.authorizeConsultationAccess(appointmentId, userId, userRole);

    const preTreatment = await repo.getSubmissionByAppointmentAndStage(
      appointmentId,
      'PRE_TREATMENT',
    );
    const postTreatment = await repo.getSubmissionByAppointmentAndStage(
      appointmentId,
      'POST_TREATMENT',
    );

    return {
      consultationId: appointmentId,
      preTreatment,
      postTreatment,
    };
  }

  /**
   * Generates or retrieves the outcome comparison report.
   */
  async getComparisonReport(
    userId: string,
    appointmentId: string,
    userRole: string,
  ): Promise<ConsultationOutcomeReport> {
    const appt = await this.authorizeConsultationAccess(
      appointmentId,
      userId,
      userRole,
    );

    const preTreatment = await repo.getSubmissionByAppointmentAndStage(
      appointmentId,
      'PRE_TREATMENT',
    );
    const postTreatment = await repo.getSubmissionByAppointmentAndStage(
      appointmentId,
      'POST_TREATMENT',
    );

    return this.buildComparisonReport(appt, preTreatment, postTreatment);
  }

  /**
   * Core Comparison & Clinical Reporting Engine
   */
  private buildComparisonReport(
    appt: repo.AppointmentRecord,
    preSub: FeedbackSubmission | null,
    postSub: FeedbackSubmission | null,
  ): ConsultationOutcomeReport {
    const preSubmitted = preSub?.status === 'SUBMITTED';
    const postSubmitted = postSub?.status === 'SUBMITTED';

    const comparisons: ComparisonItem[] = [];
    const followUpConcerns: string[] = [];

    let patientReportedExperience: ConsultationOutcomeReport['patientReportedExperience'] =
      undefined;

    if (preSubmitted && postSubmitted) {
      // Index pre-answers by comparisonKey
      const preMap = new Map<string, FeedbackAnswer>();
      for (const ans of preSub.answers) {
        if (ans.comparisonKey) {
          preMap.set(ans.comparisonKey, ans);
        }
      }

      // Check matched questions in postSub
      for (const postAns of postSub.answers) {
        if (!postAns.comparisonKey) continue;

        const preAns = preMap.get(postAns.comparisonKey);
        if (!preAns) continue;

        // Both pre and post answers exist for this comparison key
        const item = this.compareMatchedAnswers(preAns, postAns);
        comparisons.push(item);

        // Check if symptom severity significantly worsened
        if (
          postAns.comparisonKey === 'symptom_severity' &&
          typeof item.change === 'number' &&
          item.change >= 2
        ) {
          followUpConcerns.push(
            `Patient reported significant worsening of symptom severity (+${item.change} on 5-point scale).`,
          );
        }
      }

      // Extract post-treatment patient experience & safety indicators
      let perceivedChange: string | null = null;
      let treatmentSatisfaction: number | null = null;
      let expectationsMet: string | null = null;

      for (const ans of postSub.answers) {
        const text = ans.questionText.toLowerCase();

        if (text.includes('describe your condition') || text.includes('perceived change')) {
          perceivedChange = String(ans.answerValue);
          if (
            perceivedChange === 'SOMEWHAT_WORSE' ||
            perceivedChange === 'MUCH_WORSE'
          ) {
            followUpConcerns.push(
              `Patient reported global health transition as '${perceivedChange}'.`,
            );
          }
        }

        if (text.includes('satisfied are you with your overall treatment')) {
          treatmentSatisfaction = Number(ans.answerValue);
          if (treatmentSatisfaction <= 2) {
            followUpConcerns.push(
              `Patient reported low treatment satisfaction (${treatmentSatisfaction}/5).`,
            );
          }
        }

        if (text.includes('meet your initial expectations')) {
          expectationsMet = String(ans.answerValue);
          if (expectationsMet === 'NOT_MET') {
            followUpConcerns.push('Patient noted expectations were not met.');
          }
        }

        if (text.includes('unexpected side effects') && ans.answerValue === true) {
          followUpConcerns.push('Patient reported unexpected side effects.');
        }

        if (text.includes('immediate follow-up') && ans.answerValue === true) {
          followUpConcerns.push(
            'Patient requested an immediate follow-up consultation with the doctor.',
          );
        }
      }

      patientReportedExperience = {
        perceivedChange,
        treatmentSatisfaction,
        expectationsMet,
      };
    }

    const comparisonPending = !(preSubmitted && postSubmitted);
    let comparisonMessage: string | undefined = undefined;

    if (!preSubmitted && !postSubmitted) {
      comparisonMessage =
        'Neither pre-treatment nor post-treatment assessments have been completed yet.';
    } else if (!preSubmitted) {
      comparisonMessage =
        'Comparison unavailable: Baseline pre-treatment assessment was not recorded.';
    } else if (!postSubmitted) {
      comparisonMessage =
        'Comparison pending: Post-treatment assessment has not been submitted yet.';
    }

    return {
      consultationId: appt.id,
      appointment: {
        id: appt.id,
        scheduledStart: appt.scheduledStart,
        scheduledEnd: appt.scheduledEnd,
        status: appt.status,
        purpose: appt.purpose,
        doctor: {
          id: appt.doctorId,
          name: appt.doctorName,
          specialty: appt.doctorSpecialty,
        },
        patient: {
          id: appt.patientId,
          name: appt.patientName,
        },
      },
      preTreatment: {
        status: preSub?.status ?? 'NOT_STARTED',
        submittedAt: preSub?.submittedAt ?? null,
        formVersion: preSub?.formVersion,
        answers: preSub?.answers,
      },
      postTreatment: {
        status: postSub?.status ?? 'NOT_STARTED',
        submittedAt: postSub?.submittedAt ?? null,
        formVersion: postSub?.formVersion,
        answers: postSub?.answers,
      },
      comparisonPending,
      comparisonMessage,
      comparisons,
      patientReportedExperience,
      followUpConcerns,
      clinicalEscalationRequired: followUpConcerns.length > 0,
      reportGeneratedAt: new Date().toISOString(),
      reportVersion: 1,
    };
  }

  /**
   * Compares two answers matched by comparison key.
   */
  private compareMatchedAnswers(
    preAns: FeedbackAnswer,
    postAns: FeedbackAnswer,
  ): ComparisonItem {
    const isNumericType =
      preAns.questionType === 'RATING_SCALE' ||
      preAns.questionType === 'NUMERIC';

    const preNum = Number(preAns.answerValue);
    const postNum = Number(postAns.answerValue);

    let change: number | null = null;
    let interpretation: ComparisonInterpretation = 'NOT_APPLICABLE';
    let scaleDirection: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | null = null;

    if (isNumericType && !isNaN(preNum) && !isNaN(postNum)) {
      change = postNum - preNum;

      // Determine scale direction from comparison key
      if (
        preAns.comparisonKey === 'symptom_severity' ||
        preAns.comparisonKey === 'physical_function'
      ) {
        scaleDirection = 'LOWER_IS_BETTER';
      } else {
        scaleDirection = 'HIGHER_IS_BETTER';
      }

      if (scaleDirection === 'HIGHER_IS_BETTER') {
        if (change > 0) interpretation = 'PATIENT_REPORTED_IMPROVEMENT';
        else if (change < 0) interpretation = 'PATIENT_REPORTED_WORSENING';
        else interpretation = 'NO_CHANGE';
      } else {
        if (change < 0) interpretation = 'PATIENT_REPORTED_IMPROVEMENT';
        else if (change > 0) interpretation = 'PATIENT_REPORTED_WORSENING';
        else interpretation = 'NO_CHANGE';
      }
    }

    return {
      comparisonKey: postAns.comparisonKey!,
      questionText: postAns.questionText,
      preTreatmentValue: preAns.answerValue,
      postTreatmentValue: postAns.answerValue,
      change,
      interpretation,
      scaleDirection,
    };
  }
}

export const feedbackService = new FeedbackService();
