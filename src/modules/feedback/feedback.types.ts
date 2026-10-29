export const FEEDBACK_STAGES = ['PRE_TREATMENT', 'POST_TREATMENT'] as const;
export type FeedbackStage = (typeof FEEDBACK_STAGES)[number];

export const QUESTION_TYPES = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'RATING_SCALE',
  'NUMERIC',
  'SHORT_TEXT',
  'LONG_TEXT',
  'BOOLEAN',
  'DATE',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const SUBMISSION_STATUSES = ['DRAFT', 'SUBMITTED'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export interface OptionItem {
  value: string | number;
  label: string;
}

export interface ValidationRules {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
}

export interface ScoringConfig {
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  maxScore?: number;
}

export interface FeedbackQuestion {
  id: string;
  formId: string;
  comparisonKey: string | null;
  questionText: string;
  description: string | null;
  questionType: QuestionType;
  options: OptionItem[] | null;
  isRequired: boolean;
  displayOrder: number;
  validationRules: ValidationRules | null;
  scoringConfig: ScoringConfig | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackForm {
  id: string;
  formName: string;
  stage: FeedbackStage;
  description: string | null;
  version: number;
  isActive: boolean;
  treatmentCategory: string | null;
  questions: FeedbackQuestion[];
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackAnswerInput {
  questionId: string;
  answerValue: unknown;
}

export interface FeedbackAnswer {
  id: string;
  submissionId: string;
  questionId: string;
  comparisonKey: string | null;
  questionText: string;
  questionType: QuestionType;
  answerValue: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackSubmission {
  id: string;
  patientId: string;
  appointmentId: string;
  treatmentId: string | null;
  stage: FeedbackStage;
  formId: string;
  formVersion: number;
  status: SubmissionStatus;
  startedAt: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  answers: FeedbackAnswer[];
}

export interface EligibleConsultation {
  consultationId: string;
  doctorId: string;
  doctorName: string | null;
  doctorSpecialty: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  purpose: string | null;
  status: string;
  isPreTreatmentEligible: boolean;
  isPostTreatmentEligible: boolean;
  preTreatmentStatus: 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED';
  postTreatmentStatus: 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED';
  isComparisonReportAvailable: boolean;
}

export type ComparisonInterpretation =
  | 'PATIENT_REPORTED_IMPROVEMENT'
  | 'NO_CHANGE'
  | 'PATIENT_REPORTED_WORSENING'
  | 'NOT_APPLICABLE';

export interface ComparisonItem {
  comparisonKey: string;
  questionText: string;
  preTreatmentValue: unknown;
  postTreatmentValue: unknown;
  change: number | null;
  interpretation: ComparisonInterpretation;
  scaleDirection: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | null;
}

export interface ConsultationOutcomeReport {
  consultationId: string;
  appointment: {
    id: string;
    scheduledStart: string;
    scheduledEnd: string;
    status: string;
    purpose: string | null;
    doctor: {
      id: string;
      name: string | null;
      specialty: string | null;
    };
    patient: {
      id: string;
      name: string | null;
    };
  };
  preTreatment: {
    status: 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED';
    submittedAt: string | null;
    formVersion?: number | undefined;
    answers?: FeedbackAnswer[] | undefined;
  };
  postTreatment: {
    status: 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED';
    submittedAt: string | null;
    formVersion?: number | undefined;
    answers?: FeedbackAnswer[] | undefined;
  };
  comparisonPending: boolean;
  comparisonMessage?: string | undefined;
  comparisons: ComparisonItem[];
  patientReportedExperience?:
    | {
        perceivedChange: string | null;
        treatmentSatisfaction: number | null;
        expectationsMet: string | null;
      }
    | undefined;

  followUpConcerns: string[];
  clinicalEscalationRequired: boolean;
  reportGeneratedAt: string;
  reportVersion: number;
}
