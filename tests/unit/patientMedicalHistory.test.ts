import { describe, expect, it } from 'vitest';
import {
  createMedicalDocumentSchema,
  createPatientMedicalHistorySchema,
  familyMedicalHistorySchema,
  lifestyleHistorySchema,
  previousMedicalHistorySchema,
  reproductiveHistorySchema,
  updatePatientMedicalHistorySchema,
} from '@/modules/patients/patientMedicalHistory.schema.js';

describe('Patient Medical History Schemas', () => {
  describe('createPatientMedicalHistorySchema', () => {
    it('validates a comprehensive patient medical history payload', () => {
      const payload = {
        recorded_date: '2026-11-17',
        recorded_by_name: 'Dr. S. Narendran',
        notes: 'Routine comprehensive health history intake',
        previous_medical_history: {
          chronic_diseases: ['Type 2 Diabetes', 'Hypertension'],
          previous_diseases: [
            {
              disease_name: 'Viral Hepatitis A',
              diagnosis_date: '2018-03-15',
              treatment_details: 'Supportive therapy and rest',
              current_status: 'Resolved',
              remarks: 'Fully recovered without hepatic sequelae',
            },
          ],
          diabetes_history: {
            has_history: 'Yes',
            type: 'Type 2',
            duration: '5 years',
            current_treatment: 'Metformin 500mg BD',
            remarks: 'HbA1c around 6.8%',
          },
          blood_pressure_history: {
            has_history: 'Yes',
            duration: '3 years',
            current_treatment: 'Telmisartan 40mg OD',
            remarks: 'Controlled BP 120/80',
          },
          surgeries: [
            {
              surgery_name: 'Appendectomy',
              surgery_date: '2015-08-20',
              hospital_name: 'Apollo Hospital Chennai',
              surgeon_name: 'Dr. Raman',
              remarks: 'Laparoscopic procedure, uncomplicated',
            },
          ],
          hospital_admissions: [
            {
              hospital_name: 'City Hospital',
              reason: 'Severe Dengue Fever',
              admission_date: '2019-10-10',
              discharge_date: '2019-10-16',
              remarks: 'Platelet transfusion administered',
            },
          ],
          injuries_accidents: [
            {
              description: 'Right wrist fracture from sports injury',
              date: '2012-05-04',
              treatment: 'Plaster cast for 6 weeks',
              remarks: 'Healed completely',
            },
          ],
          blood_transfusions: {
            had_transfusion: 'Yes',
            transfusion_date: '2019-10-12',
            number_of_units: 2,
            reason: 'Platelet loss during dengue infection',
            reactions: 'None',
            remarks: 'Uneventful transfusion',
          },
          allergies: {
            medicine_allergies: 'Penicillin (Skin hives and itching)',
            food_allergies: 'Peanuts',
            other_allergies: 'Pollen',
            remarks: 'Wear medical alert band for penicillin',
          },
          current_medications: [
            {
              medicine_name: 'Metformin',
              dosage: '500mg',
              frequency: 'Twice daily',
              route: 'Oral',
              started_date: '2021-02-01',
              reason: 'Type 2 Diabetes glycemic control',
            },
          ],
          previous_medications: [
            {
              medicine_name: 'Glimepiride',
              dosage: '1mg',
              frequency: 'Once daily',
              stopped_date: '2022-01-15',
              reason: 'Switched due to mild hypoglycemia',
            },
          ],
          ongoing_treatments: 'Dietary therapy and physiotherapy for posture',
        },
        family_medical_history: {
          has_family_history: 'Yes',
          members: [
            {
              relationship: 'Father',
              disease_name: 'Coronary Artery Disease',
              age_at_diagnosis: 55,
              current_health_status: 'Deceased',
              cause_of_death: 'Myocardial Infarction at age 70',
              remarks: 'Had CABG in 2012',
            },
            {
              relationship: 'Mother',
              disease_name: 'Type 2 Diabetes',
              age_at_diagnosis: 48,
              current_health_status: 'Alive - Managing Condition',
              remarks: 'On oral hypoglycemics',
            },
          ],
        },
        reproductive_history: {
          is_applicable: true,
          marital_status: 'Married',
          age_at_menarche: 13,
          menstrual_status: 'Regular',
          number_of_pregnancies: 2,
          number_of_deliveries: 2,
          number_of_children: 2,
          number_of_living_children: 2,
          number_of_miscarriages: 0,
          number_of_abortions: 0,
          age_at_first_childbirth: 26,
          date_of_last_childbirth: '2018-09-12',
          breastfeeding_history: 'Yes',
          breastfeeding_duration: '12 months',
          contraceptive_usage: 'Barrier method',
          hormone_therapy_history: 'None',
          infertility_treatment_history: 'None',
        },
        lifestyle_history: {
          smoking_status: 'Former',
          smoking_duration: 'Quit 5 years ago (smoked 5 pack-years)',
          alcohol_consumption: 'Occasionally',
          tobacco_usage: 'Never',
          chewing_tobacco: 'Never',
          diet_type: 'Non-Vegetarian',
          physical_activity_level: 'Moderate',
          sleep_pattern: '7 hours nightly, regular schedule',
          occupational_exposure: 'Office desk job, minimal chemical exposure',
          other_habits: 'Regular morning brisk walking',
        },
        current_medical_info: {
          chief_complaint: 'Mild fatigue and periodic tension headache',
          current_symptoms: 'Bilateral mild throbbing ache, neck tightness',
          duration_of_symptoms: '2 weeks',
          pain_level: 3,
          current_diagnosis: 'Tension-type headache, controlled hypertension',
          clinical_observations: 'Vitals stable, neurologically intact, soft abdomen',
          height_cm: 165,
          weight_kg: 68,
          bmi: 25.0,
          blood_pressure: '120/80',
          pulse_rate: 74,
          temperature: 98.4,
          oxygen_saturation: 99,
        },
      };

      const parsed = createPatientMedicalHistorySchema.parse(payload);
      expect(parsed.recorded_date).toBe('2026-11-17');
      expect(parsed.previous_medical_history.chronic_diseases).toContain('Type 2 Diabetes');
      expect(parsed.previous_medical_history.surgeries?.length).toBe(1);
      expect(parsed.family_medical_history.members?.length).toBe(2);
      expect(parsed.reproductive_history.is_applicable).toBe(true);
      expect(parsed.current_medical_info.pain_level).toBe(3);
    });

    it('defaults optional nested structures when omitted', () => {
      const minimalPayload = {};
      const parsed = createPatientMedicalHistorySchema.parse(minimalPayload);

      expect(parsed.previous_medical_history.chronic_diseases).toEqual([]);
      expect(parsed.previous_medical_history.previous_diseases).toEqual([]);
      expect(parsed.family_medical_history.members).toEqual([]);
      expect(parsed.reproductive_history.is_applicable).toBe(true);
    });

    it('validates partial update schema', () => {
      const updatePayload = {
        notes: 'Follow-up visit notes updated',
        current_medical_info: {
          blood_pressure: '118/76',
          pain_level: 1,
        },
      };

      const parsed = updatePatientMedicalHistorySchema.parse(updatePayload);
      expect(parsed.notes).toBe('Follow-up visit notes updated');
      expect(parsed.current_medical_info?.blood_pressure).toBe('118/76');
    });

    it('validates pain level boundary check (0 to 10)', () => {
      const invalidPayload = {
        current_medical_info: {
          pain_level: 11,
        },
      };
      expect(() => createPatientMedicalHistorySchema.parse(invalidPayload)).toThrow();
    });
  });

  describe('createMedicalDocumentSchema', () => {
    it('validates document creation payload', () => {
      const doc = {
        document_type: 'Discharge Summary',
        title: 'Post-Op Discharge Summary 2026',
        file_name: 'discharge_summary.pdf',
        file_url: 'https://cdn.example.com/discharge_summary.pdf',
        file_type: 'application/pdf',
        file_size: 1048576,
        document_date: '2026-11-10',
        notes: 'Patient advised 2 weeks rest',
      };

      const parsed = createMedicalDocumentSchema.parse(doc);
      expect(parsed.document_type).toBe('Discharge Summary');
      expect(parsed.title).toBe('Post-Op Discharge Summary 2026');
    });

    it('requires document title, type, and file URL', () => {
      expect(() =>
        createMedicalDocumentSchema.parse({
          document_type: '',
          title: '',
          file_name: '',
          file_url: '',
        }),
      ).toThrow();
    });
  });
});
