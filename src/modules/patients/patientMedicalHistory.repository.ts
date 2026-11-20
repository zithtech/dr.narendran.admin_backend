import { pool } from '@/db/pool.js';
import type {
  PatientMedicalDocument,
  PatientMedicalHistoryRecord,
} from './patientMedicalHistory.types.js';

let tablesEnsured = false;

export async function ensureMedicalHistoryTables(client: any): Promise<void> {
  if (tablesEnsured) return;
  try {
    await client.query(`
      ALTER TABLE patients ADD COLUMN IF NOT EXISTS occupation VARCHAR(150);

      CREATE TABLE IF NOT EXISTS patient_medical_histories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
        recorded_by_id UUID,
        recorded_by_name VARCHAR(255),
        notes TEXT,
        previous_medical_history JSONB NOT NULL DEFAULT '{}'::jsonb,
        family_medical_history JSONB NOT NULL DEFAULT '{}'::jsonb,
        reproductive_history JSONB NOT NULL DEFAULT '{}'::jsonb,
        lifestyle_history JSONB NOT NULL DEFAULT '{}'::jsonb,
        current_medical_info JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_pmh_patient_id ON patient_medical_histories(patient_id);
      CREATE INDEX IF NOT EXISTS idx_pmh_recorded_date ON patient_medical_histories(recorded_date DESC);

      CREATE TABLE IF NOT EXISTS patient_medical_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        medical_history_id UUID REFERENCES patient_medical_histories(id) ON DELETE SET NULL,
        document_type VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_url TEXT NOT NULL,
        storage_key TEXT,
        file_type VARCHAR(100),
        file_size BIGINT,
        document_date DATE DEFAULT CURRENT_DATE,
        notes TEXT,
        uploaded_by_id UUID,
        uploaded_by_name VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_pmd_patient_id ON patient_medical_documents(patient_id);
      CREATE INDEX IF NOT EXISTS idx_pmd_type ON patient_medical_documents(document_type);
    `);
    tablesEnsured = true;
  } catch (err) {
    console.error('Failed to ensure patient medical history tables:', err);
  }
}

async function resolvePatientUuid(client: any, patientIdOrCode: string): Promise<string> {
  if (!patientIdOrCode) return patientIdOrCode;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientIdOrCode);
  if (isUuid) {
    const { rows } = await client.query(
      `SELECT id FROM patients WHERE id = $1 OR user_account_id = $1 LIMIT 1`,
      [patientIdOrCode],
    );
    if (rows[0]?.id) return rows[0].id;
    return patientIdOrCode;
  }
  const { rows } = await client.query(
    `SELECT id FROM patients WHERE patient_id = $1 OR id::text = $1 OR user_account_id::text = $1 LIMIT 1`,
    [patientIdOrCode],
  );
  if (rows[0]?.id) return rows[0].id;
  return patientIdOrCode;
}

export class PatientMedicalHistoryRepository {
  async getHistoriesByPatientId(patientId: string): Promise<PatientMedicalHistoryRecord[]> {
    const client = await pool.connect();
    try {
      await ensureMedicalHistoryTables(client);
      const resolvedPatientId = await resolvePatientUuid(client, patientId);
      const { rows } = await client.query(
        `SELECT * FROM patient_medical_histories 
         WHERE patient_id = $1 
         ORDER BY recorded_date DESC, created_at DESC`,
        [resolvedPatientId],
      );
      return rows;
    } finally {
      client.release();
    }
  }

  async getHistoryById(id: string): Promise<PatientMedicalHistoryRecord | null> {
    const client = await pool.connect();
    try {
      await ensureMedicalHistoryTables(client);
      const { rows } = await client.query(
        `SELECT * FROM patient_medical_histories WHERE id = $1`,
        [id],
      );
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async getLatestHistory(patientId: string): Promise<PatientMedicalHistoryRecord | null> {
    const client = await pool.connect();
    try {
      await ensureMedicalHistoryTables(client);
      const resolvedPatientId = await resolvePatientUuid(client, patientId);
      const { rows } = await client.query(
        `SELECT * FROM patient_medical_histories 
         WHERE patient_id = $1 
         ORDER BY recorded_date DESC, created_at DESC 
         LIMIT 1`,
        [resolvedPatientId],
      );
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async createHistory(
    patientId: string,
    data: any,
    user?: { id?: string; email?: string; fullName?: string },
  ): Promise<PatientMedicalHistoryRecord> {
    const client = await pool.connect();
    try {
      await ensureMedicalHistoryTables(client);
      const resolvedPatientId = await resolvePatientUuid(client, patientId);
      const recordedDate = data.recorded_date || new Date().toISOString().split('T')[0];
      const recordedByName =
        data.recorded_by_name || user?.fullName || user?.email || 'Attending Physician';
      const recordedById = user?.id || null;

      // Duplicate check: if a history was already recorded on the same date with identical complaint/notes
      const checkSql = `
        SELECT id FROM patient_medical_histories 
        WHERE patient_id = $1 AND recorded_date = $2 
          AND COALESCE(notes, '') = COALESCE($3, '')
        LIMIT 1
      `;
      const existing = await client.query(checkSql, [resolvedPatientId, recordedDate, data.notes || null]);
      if (existing.rows.length > 0) {
        // Update existing instead of creating accidental duplicates
        return await this.updateHistory(existing.rows[0].id, data, user);
      }

      const lifeHistory = data.lifestyle_history ?? data.lifecycle_history ?? {};

      const { rows } = await client.query(
        `INSERT INTO patient_medical_histories (
          patient_id, recorded_date, recorded_by_id, recorded_by_name, notes,
          previous_medical_history, family_medical_history, reproductive_history,
          lifestyle_history, current_medical_info, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING *`,
        [
          resolvedPatientId,
          recordedDate,
          recordedById,
          recordedByName,
          data.notes || null,
          JSON.stringify(data.previous_medical_history || {}),
          JSON.stringify(data.family_medical_history || {}),
          JSON.stringify(data.reproductive_history || {}),
          JSON.stringify(lifeHistory),
          JSON.stringify(data.current_medical_info || {}),
        ],
      );

      // Optionally sync primary vitals back to the patient row without overriding other patient data
      if (data.current_medical_info) {
        const cmi = data.current_medical_info;
        const updates: string[] = [];
        const params: any[] = [];
        let pIdx = 1;

        if (cmi.height_cm !== undefined && cmi.height_cm !== null && cmi.height_cm !== '') {
          updates.push(`height_cm = $${pIdx++}`);
          params.push(Number(cmi.height_cm));
        }
        if (cmi.weight_kg !== undefined && cmi.weight_kg !== null && cmi.weight_kg !== '') {
          updates.push(`weight_kg = $${pIdx++}`);
          params.push(Number(cmi.weight_kg));
        }
        if (cmi.blood_pressure) {
          updates.push(`blood_pressure = $${pIdx++}`);
          params.push(String(cmi.blood_pressure));
        }
        if (cmi.temperature) {
          updates.push(`body_temperature = $${pIdx++}`);
          params.push(String(cmi.temperature));
        }
        if (updates.length > 0) {
          params.push(resolvedPatientId);
          await client.query(
            `UPDATE patients SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${pIdx}`,
            params,
          );
        }
      }

      return rows[0];
    } finally {
      client.release();
    }
  }

  async updateHistory(
    id: string,
    data: any,
    user?: { id?: string; email?: string; fullName?: string },
  ): Promise<PatientMedicalHistoryRecord> {
    const client = await pool.connect();
    try {
      await ensureMedicalHistoryTables(client);
      const current = await this.getHistoryById(id);
      if (!current) {
        throw new Error('Medical history record not found');
      }

      const recordedDate = data.recorded_date !== undefined ? data.recorded_date : current.recorded_date;
      const recordedByName =
        data.recorded_by_name !== undefined
          ? data.recorded_by_name
          : user?.fullName || current.recorded_by_name;
      const notes = data.notes !== undefined ? data.notes : current.notes;
      const parseObj = (val: any) => {
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch { return {}; }
        }
        return typeof val === 'object' && val !== null ? val : {};
      };

      const prevHistory =
        data.previous_medical_history !== undefined && data.previous_medical_history !== null
          ? { ...parseObj(current.previous_medical_history), ...parseObj(data.previous_medical_history) }
          : current.previous_medical_history;
      const famHistory =
        data.family_medical_history !== undefined && data.family_medical_history !== null
          ? { ...parseObj(current.family_medical_history), ...parseObj(data.family_medical_history) }
          : current.family_medical_history;
      const repHistory =
        data.reproductive_history !== undefined && data.reproductive_history !== null
          ? { ...parseObj(current.reproductive_history), ...parseObj(data.reproductive_history) }
          : current.reproductive_history;
      const rawLife =
        data.lifestyle_history !== undefined && data.lifestyle_history !== null
          ? data.lifestyle_history
          : data.lifecycle_history !== undefined && data.lifecycle_history !== null
          ? data.lifecycle_history
          : undefined;
      const lifeHistory =
        rawLife !== undefined
          ? { ...parseObj(current.lifestyle_history), ...parseObj(rawLife) }
          : current.lifestyle_history;
      const curMedInfo =
        data.current_medical_info !== undefined && data.current_medical_info !== null
          ? { ...parseObj(current.current_medical_info), ...parseObj(data.current_medical_info) }
          : current.current_medical_info;

      const { rows } = await client.query(
        `UPDATE patient_medical_histories 
         SET recorded_date = $1, recorded_by_name = $2, notes = $3,
             previous_medical_history = $4, family_medical_history = $5,
             reproductive_history = $6, lifestyle_history = $7,
             current_medical_info = $8, updated_at = NOW()
         WHERE id = $9
         RETURNING *`,
        [
          recordedDate,
          recordedByName,
          notes,
          JSON.stringify(prevHistory || {}),
          JSON.stringify(famHistory || {}),
          JSON.stringify(repHistory || {}),
          JSON.stringify(lifeHistory || {}),
          JSON.stringify(curMedInfo || {}),
          id,
        ],
      );

      // Optionally sync primary vitals back to the patient row
      if (curMedInfo) {
        const updates: string[] = [];
        const params: any[] = [];
        let pIdx = 1;

        if (curMedInfo.height_cm !== undefined && curMedInfo.height_cm !== null && curMedInfo.height_cm !== '') {
          updates.push(`height_cm = $${pIdx++}`);
          params.push(Number(curMedInfo.height_cm));
        }
        if (curMedInfo.weight_kg !== undefined && curMedInfo.weight_kg !== null && curMedInfo.weight_kg !== '') {
          updates.push(`weight_kg = $${pIdx++}`);
          params.push(Number(curMedInfo.weight_kg));
        }
        if (curMedInfo.blood_pressure) {
          updates.push(`blood_pressure = $${pIdx++}`);
          params.push(String(curMedInfo.blood_pressure));
        }
        if (curMedInfo.temperature) {
          updates.push(`body_temperature = $${pIdx++}`);
          params.push(String(curMedInfo.temperature));
        }
        if (updates.length > 0) {
          params.push(current.patient_id);
          await client.query(
            `UPDATE patients SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${pIdx}`,
            params,
          );
        }
      }

      return rows[0];
    } finally {
      client.release();
    }
  }

  async deleteHistory(id: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await ensureMedicalHistoryTables(client);
      const { rowCount } = await client.query(
        `DELETE FROM patient_medical_histories WHERE id = $1`,
        [id],
      );
      return (rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  async getDocumentsByPatientId(
    patientId: string,
    documentType?: string,
  ): Promise<PatientMedicalDocument[]> {
    const client = await pool.connect();
    try {
      await ensureMedicalHistoryTables(client);
      const resolvedPatientId = await resolvePatientUuid(client, patientId);
      let sql = `SELECT * FROM patient_medical_documents WHERE patient_id = $1`;
      const params: any[] = [resolvedPatientId];
      if (documentType && documentType.trim() && documentType.toUpperCase() !== 'ALL') {
        sql += ` AND document_type = $2`;
        params.push(documentType.trim());
      }
      sql += ` ORDER BY created_at DESC`;
      const { rows } = await client.query(sql, params);
      return rows;
    } finally {
      client.release();
    }
  }

  async getDocumentById(id: string): Promise<PatientMedicalDocument | null> {
    const client = await pool.connect();
    try {
      await ensureMedicalHistoryTables(client);
      const { rows } = await client.query(
        `SELECT * FROM patient_medical_documents WHERE id = $1`,
        [id],
      );
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async createDocument(
    patientId: string,
    docData: any,
    user?: { id?: string; email?: string; fullName?: string },
  ): Promise<PatientMedicalDocument> {
    const client = await pool.connect();
    try {
      await ensureMedicalHistoryTables(client);
      const resolvedPatientId = await resolvePatientUuid(client, patientId);
      const { rows } = await client.query(
        `INSERT INTO patient_medical_documents (
          patient_id, medical_history_id, document_type, title, file_name,
          file_url, storage_key, file_type, file_size, document_date, notes,
          uploaded_by_id, uploaded_by_name, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
        RETURNING *`,
        [
          resolvedPatientId,
          docData.medical_history_id || null,
          docData.document_type,
          docData.title,
          docData.file_name,
          docData.file_url,
          docData.storage_key || null,
          docData.file_type || null,
          docData.file_size || null,
          docData.document_date || new Date().toISOString().split('T')[0],
          docData.notes || null,
          user?.id || null,
          user?.fullName || user?.email || 'Staff',
        ],
      );
      return rows[0];
    } finally {
      client.release();
    }
  }

  async deleteDocument(id: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await ensureMedicalHistoryTables(client);
      const { rowCount } = await client.query(
        `DELETE FROM patient_medical_documents WHERE id = $1`,
        [id],
      );
      return (rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }
}

export const patientMedicalHistoryRepository = new PatientMedicalHistoryRepository();
