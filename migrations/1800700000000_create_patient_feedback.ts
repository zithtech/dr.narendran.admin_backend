import { type MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Feedback Forms Table
  pgm.createTable('feedback_forms', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    form_name: {
      type: 'varchar(255)',
      notNull: true,
    },
    stage: {
      type: 'varchar(50)',
      notNull: true,
    },
    description: {
      type: 'text',
      notNull: false,
    },
    version: {
      type: 'integer',
      notNull: true,
      default: 1,
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    treatment_category: {
      type: 'varchar(100)',
      notNull: false,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.addConstraint(
    'feedback_forms',
    'chk_feedback_form_stage',
    `CHECK (stage IN ('PRE_TREATMENT', 'POST_TREATMENT'))`,
  );

  pgm.addConstraint(
    'feedback_forms',
    'uq_feedback_form_stage_version',
    'UNIQUE (stage, version)',
  );

  // 2. Feedback Questions Table
  pgm.createTable('feedback_questions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    form_id: {
      type: 'uuid',
      notNull: true,
      references: 'feedback_forms',
      onDelete: 'CASCADE',
    },
    comparison_key: {
      type: 'varchar(100)',
      notNull: false,
    },
    question_text: {
      type: 'text',
      notNull: true,
    },
    description: {
      type: 'text',
      notNull: false,
    },
    question_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    options: {
      type: 'jsonb',
      notNull: false,
    },
    is_required: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    display_order: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    validation_rules: {
      type: 'jsonb',
      notNull: false,
    },
    scoring_config: {
      type: 'jsonb',
      notNull: false,
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.addConstraint(
    'feedback_questions',
    'chk_feedback_question_type',
    `CHECK (question_type IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'RATING_SCALE', 'NUMERIC', 'SHORT_TEXT', 'LONG_TEXT', 'BOOLEAN', 'DATE'))`,
  );

  pgm.createIndex('feedback_questions', ['form_id', 'display_order'], {
    name: 'idx_feedback_questions_form_order',
  });

  pgm.createIndex('feedback_questions', ['comparison_key'], {
    name: 'idx_feedback_questions_comparison_key',
  });

  // 3. Feedback Submissions Table
  pgm.createTable('feedback_submissions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    patient_id: {
      type: 'uuid',
      notNull: true,
    },
    appointment_id: {
      type: 'uuid',
      notNull: true,
      references: 'appointments',
      onDelete: 'CASCADE',
    },
    treatment_id: {
      type: 'uuid',
      notNull: false,
    },
    stage: {
      type: 'varchar(50)',
      notNull: true,
    },
    form_id: {
      type: 'uuid',
      notNull: true,
      references: 'feedback_forms',
      onDelete: 'RESTRICT',
    },
    form_version: {
      type: 'integer',
      notNull: true,
      default: 1,
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'DRAFT',
    },
    started_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    submitted_at: {
      type: 'timestamptz',
      notNull: false,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.addConstraint(
    'feedback_submissions',
    'chk_feedback_submission_stage',
    `CHECK (stage IN ('PRE_TREATMENT', 'POST_TREATMENT'))`,
  );

  pgm.addConstraint(
    'feedback_submissions',
    'chk_feedback_submission_status',
    `CHECK (status IN ('DRAFT', 'SUBMITTED'))`,
  );

  pgm.addConstraint(
    'feedback_submissions',
    'uq_feedback_submission_appt_stage',
    'UNIQUE (appointment_id, stage)',
  );

  pgm.createIndex('feedback_submissions', ['patient_id'], {
    name: 'idx_feedback_submissions_patient',
  });

  pgm.createIndex('feedback_submissions', ['appointment_id'], {
    name: 'idx_feedback_submissions_appointment',
  });

  // 4. Feedback Answers Table
  pgm.createTable('feedback_answers', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    submission_id: {
      type: 'uuid',
      notNull: true,
      references: 'feedback_submissions',
      onDelete: 'CASCADE',
    },
    question_id: {
      type: 'uuid',
      notNull: true,
      references: 'feedback_questions',
      onDelete: 'RESTRICT',
    },
    answer_value: {
      type: 'jsonb',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.addConstraint(
    'feedback_answers',
    'uq_feedback_answers_sub_question',
    'UNIQUE (submission_id, question_id)',
  );

  pgm.createIndex('feedback_answers', ['submission_id'], {
    name: 'idx_feedback_answers_sub',
  });

  // 5. Feedback Report Snapshots Table
  pgm.createTable('feedback_report_snapshots', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    patient_id: {
      type: 'uuid',
      notNull: true,
    },
    appointment_id: {
      type: 'uuid',
      notNull: true,
      references: 'appointments',
      onDelete: 'CASCADE',
    },
    pre_submission_id: {
      type: 'uuid',
      notNull: false,
      references: 'feedback_submissions',
      onDelete: 'SET NULL',
    },
    post_submission_id: {
      type: 'uuid',
      notNull: false,
      references: 'feedback_submissions',
      onDelete: 'SET NULL',
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'GENERATED',
    },
    report_version: {
      type: 'integer',
      notNull: true,
      default: 1,
    },
    report_data: {
      type: 'jsonb',
      notNull: true,
    },
    generated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.addConstraint(
    'feedback_report_snapshots',
    'uq_feedback_report_appt_version',
    'UNIQUE (appointment_id, report_version)',
  );

  pgm.createIndex('feedback_report_snapshots', ['appointment_id'], {
    name: 'idx_feedback_report_snapshots_appointment',
  });

  // 6. Seed Initial Form Definitions & Questions
  const preFormId = '11111111-1111-1111-1111-111111111111';
  const postFormId = '22222222-2222-2222-2222-222222222222';

  pgm.sql(`
    INSERT INTO feedback_forms (id, form_name, stage, description, version, is_active)
    VALUES 
      ('${preFormId}', 'Baseline Pre-Treatment Assessment', 'PRE_TREATMENT', 'Patient baseline symptoms and general health condition prior to treatment', 1, true),
      ('${postFormId}', 'Post-Treatment Recovery & Outcome Assessment', 'POST_TREATMENT', 'Patient recovery, symptom changes, and treatment experience after consultation or treatment', 1, true)
    ON CONFLICT (stage, version) DO NOTHING;

    -- Seed Pre-Treatment Questions
    INSERT INTO feedback_questions (form_id, comparison_key, question_text, description, question_type, options, is_required, display_order, validation_rules, scoring_config, is_active)
    VALUES
      (
        '${preFormId}',
        'symptom_severity',
        'How would you rate the severity of your primary symptoms today?',
        '1 = Very Mild, 5 = Extremely Severe',
        'RATING_SCALE',
        '[{"value": 1, "label": "Very Mild"}, {"value": 2, "label": "Mild"}, {"value": 3, "label": "Moderate"}, {"value": 4, "label": "Severe"}, {"value": 5, "label": "Extremely Severe"}]'::jsonb,
        true,
        1,
        '{"min": 1, "max": 5}'::jsonb,
        '{"direction": "LOWER_IS_BETTER"}'::jsonb,
        true
      ),
      (
        '${preFormId}',
        'physical_function',
        'How much do your symptoms interfere with your daily physical activities?',
        '1 = Not at all, 5 = Completely unable to perform normal activities',
        'RATING_SCALE',
        '[{"value": 1, "label": "Not at all"}, {"value": 2, "label": "A little bit"}, {"value": 3, "label": "Moderately"}, {"value": 4, "label": "Quite a bit"}, {"value": 5, "label": "Completely"}]'::jsonb,
        true,
        2,
        '{"min": 1, "max": 5}'::jsonb,
        '{"direction": "LOWER_IS_BETTER"}'::jsonb,
        true
      ),
      (
        '${preFormId}',
        'emotional_wellbeing',
        'How would you rate your emotional well-being (mood, stress, anxiety) regarding your condition?',
        '1 = Very Poor, 5 = Excellent',
        'RATING_SCALE',
        '[{"value": 1, "label": "Very Poor"}, {"value": 2, "label": "Poor"}, {"value": 3, "label": "Fair"}, {"value": 4, "label": "Good"}, {"value": 5, "label": "Excellent"}]'::jsonb,
        true,
        3,
        '{"min": 1, "max": 5}'::jsonb,
        '{"direction": "HIGHER_IS_BETTER"}'::jsonb,
        true
      ),
      (
        '${preFormId}',
        'sleep_energy',
        'How would you rate your sleep quality and energy levels recently?',
        '1 = Very Poor, 5 = Excellent',
        'RATING_SCALE',
        '[{"value": 1, "label": "Very Poor"}, {"value": 2, "label": "Poor"}, {"value": 3, "label": "Fair"}, {"value": 4, "label": "Good"}, {"value": 5, "label": "Excellent"}]'::jsonb,
        true,
        4,
        '{"min": 1, "max": 5}'::jsonb,
        '{"direction": "HIGHER_IS_BETTER"}'::jsonb,
        true
      ),
      (
        '${preFormId}',
        'overall_health',
        'In general, how would you rate your overall health today?',
        '1 = Poor, 5 = Excellent',
        'RATING_SCALE',
        '[{"value": 1, "label": "Poor"}, {"value": 2, "label": "Fair"}, {"value": 3, "label": "Good"}, {"value": 4, "label": "Very Good"}, {"value": 5, "label": "Excellent"}]'::jsonb,
        true,
        5,
        '{"min": 1, "max": 5}'::jsonb,
        '{"direction": "HIGHER_IS_BETTER"}'::jsonb,
        true
      ),
      (
        '${preFormId}',
        NULL,
        'Please describe your primary symptoms or main reason for this consultation.',
        'Briefly outline your chief health complaint',
        'SHORT_TEXT',
        NULL,
        true,
        6,
        '{"minLength": 2, "maxLength": 500}'::jsonb,
        NULL,
        true
      ),
      (
        '${preFormId}',
        NULL,
        'What are your primary goals or expectations for this treatment/consultation?',
        'e.g., symptom relief, diagnosis clarity, long-term health management',
        'LONG_TEXT',
        NULL,
        false,
        7,
        '{"maxLength": 2000}'::jsonb,
        NULL,
        true
      ),
      (
        '${preFormId}',
        NULL,
        'Do you have any specific concerns or questions about the upcoming treatment?',
        'Optional notes or worries for the attending doctor',
        'LONG_TEXT',
        NULL,
        false,
        8,
        '{"maxLength": 2000}'::jsonb,
        NULL,
        true
      );

    -- Seed Post-Treatment Questions
    INSERT INTO feedback_questions (form_id, comparison_key, question_text, description, question_type, options, is_required, display_order, validation_rules, scoring_config, is_active)
    VALUES
      (
        '${postFormId}',
        'symptom_severity',
        'How would you rate the severity of your primary symptoms after treatment?',
        '1 = Very Mild / Resolved, 5 = Extremely Severe',
        'RATING_SCALE',
        '[{"value": 1, "label": "Very Mild / Resolved"}, {"value": 2, "label": "Mild"}, {"value": 3, "label": "Moderate"}, {"value": 4, "label": "Severe"}, {"value": 5, "label": "Extremely Severe"}]'::jsonb,
        true,
        1,
        '{"min": 1, "max": 5}'::jsonb,
        '{"direction": "LOWER_IS_BETTER"}'::jsonb,
        true
      ),
      (
        '${postFormId}',
        'physical_function',
        'How much do your symptoms currently interfere with your normal daily physical activities?',
        '1 = Not at all, 5 = Completely unable to perform normal activities',
        'RATING_SCALE',
        '[{"value": 1, "label": "Not at all"}, {"value": 2, "label": "A little bit"}, {"value": 3, "label": "Moderately"}, {"value": 4, "label": "Quite a bit"}, {"value": 5, "label": "Completely"}]'::jsonb,
        true,
        2,
        '{"min": 1, "max": 5}'::jsonb,
        '{"direction": "LOWER_IS_BETTER"}'::jsonb,
        true
      ),
      (
        '${postFormId}',
        'emotional_wellbeing',
        'How would you rate your emotional well-being (mood, stress, anxiety) regarding your condition now?',
        '1 = Very Poor, 5 = Excellent',
        'RATING_SCALE',
        '[{"value": 1, "label": "Very Poor"}, {"value": 2, "label": "Poor"}, {"value": 3, "label": "Fair"}, {"value": 4, "label": "Good"}, {"value": 5, "label": "Excellent"}]'::jsonb,
        true,
        3,
        '{"min": 1, "max": 5}'::jsonb,
        '{"direction": "HIGHER_IS_BETTER"}'::jsonb,
        true
      ),
      (
        '${postFormId}',
        'sleep_energy',
        'How would you rate your sleep quality and energy levels currently?',
        '1 = Very Poor, 5 = Excellent',
        'RATING_SCALE',
        '[{"value": 1, "label": "Very Poor"}, {"value": 2, "label": "Poor"}, {"value": 3, "label": "Fair"}, {"value": 4, "label": "Good"}, {"value": 5, "label": "Excellent"}]'::jsonb,
        true,
        4,
        '{"min": 1, "max": 5}'::jsonb,
        '{"direction": "HIGHER_IS_BETTER"}'::jsonb,
        true
      ),
      (
        '${postFormId}',
        'overall_health',
        'In general, how would you rate your overall health today?',
        '1 = Poor, 5 = Excellent',
        'RATING_SCALE',
        '[{"value": 1, "label": "Poor"}, {"value": 2, "label": "Fair"}, {"value": 3, "label": "Good"}, {"value": 4, "label": "Very Good"}, {"value": 5, "label": "Excellent"}]'::jsonb,
        true,
        5,
        '{"min": 1, "max": 5}'::jsonb,
        '{"direction": "HIGHER_IS_BETTER"}'::jsonb,
        true
      ),
      (
        '${postFormId}',
        NULL,
        'Overall, compared to before treatment, how would you describe your condition?',
        'Patient-reported global transition rating',
        'SINGLE_CHOICE',
        '[{"value": "MUCH_BETTER", "label": "Much Better"}, {"value": "SOMEWHAT_BETTER", "label": "Somewhat Better"}, {"value": "NO_CHANGE", "label": "About the Same"}, {"value": "SOMEWHAT_WORSE", "label": "Somewhat Worse"}, {"value": "MUCH_WORSE", "label": "Much Worse"}]'::jsonb,
        true,
        6,
        NULL,
        NULL,
        true
      ),
      (
        '${postFormId}',
        NULL,
        'How satisfied are you with your overall treatment experience and care received?',
        '1 = Very Dissatisfied, 5 = Very Satisfied',
        'RATING_SCALE',
        '[{"value": 1, "label": "Very Dissatisfied"}, {"value": 2, "label": "Dissatisfied"}, {"value": 3, "label": "Neutral"}, {"value": 4, "label": "Satisfied"}, {"value": 5, "label": "Very Satisfied"}]'::jsonb,
        true,
        7,
        '{"min": 1, "max": 5}'::jsonb,
        '{"direction": "HIGHER_IS_BETTER"}'::jsonb,
        true
      ),
      (
        '${postFormId}',
        NULL,
        'Have you experienced any unexpected side effects or adverse reactions?',
        'Mark yes if you encountered side effects from medications or procedures',
        'BOOLEAN',
        NULL,
        true,
        8,
        NULL,
        NULL,
        true
      ),
      (
        '${postFormId}',
        NULL,
        'If you experienced side effects or worsening symptoms, please describe them:',
        'Provide clinical details for review by your doctor',
        'LONG_TEXT',
        NULL,
        false,
        9,
        '{"maxLength": 2000}'::jsonb,
        NULL,
        true
      ),
      (
        '${postFormId}',
        NULL,
        'To what extent did the treatment meet your initial expectations?',
        'Goal attainment rating',
        'SINGLE_CHOICE',
        '[{"value": "EXCEEDED", "label": "Exceeded expectations"}, {"value": "FULLY_MET", "label": "Fully met expectations"}, {"value": "PARTIALLY_MET", "label": "Partially met expectations"}, {"value": "NOT_MET", "label": "Did not meet expectations"}]'::jsonb,
        true,
        10,
        NULL,
        NULL,
        true
      ),
      (
        '${postFormId}',
        NULL,
        'Do you feel you need an immediate follow-up consultation with the doctor?',
        'Mark yes if you require urgent care or doctor consultation',
        'BOOLEAN',
        NULL,
        true,
        11,
        NULL,
        NULL,
        true
      ),
      (
        '${postFormId}',
        NULL,
        'Any specific recovery concerns or notes for your doctor?',
        'Optional notes or observations',
        'LONG_TEXT',
        NULL,
        false,
        12,
        '{"maxLength": 2000}'::jsonb,
        NULL,
        true
      );
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('feedback_report_snapshots', { ifExists: true, cascade: true });
  pgm.dropTable('feedback_answers', { ifExists: true, cascade: true });
  pgm.dropTable('feedback_submissions', { ifExists: true, cascade: true });
  pgm.dropTable('feedback_questions', { ifExists: true, cascade: true });
  pgm.dropTable('feedback_forms', { ifExists: true, cascade: true });
}
