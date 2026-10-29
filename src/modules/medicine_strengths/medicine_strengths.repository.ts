import { pool } from '@/db/pool.js';
import type {
  CreateMedicineStrengthInput,
  QueryMedicineStrengthsInput,
  UpdateMedicineStrengthInput,
} from './medicine_strengths.schema.js';

export interface MedicineStrengthRow {
  id: string;
  medicine_id: string;
  medicine_name?: string;
  generic_name?: string | null;
  therapeutic_category?: string | null;
  manufacturer?: string | null;
  strength: string;
  strength_unit: string;
  dosage_form: string;
  strip_count: number;
  tablets_per_strip: number | null;
  total_tablets: number;
  available_quantity: number;
  mrp: number | null;
  discount_type: string | null;
  discount_value: number | null;
  final_price: number | null;
  purchase_price: number | null;
  reorder_level: number;
  variant_code: string | null;
  barcode: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function findById(id: string): Promise<MedicineStrengthRow | null> {
  const result = await pool.query(
    `
    SELECT 
      ms.*,
      m.medicine_name,
      m.generic_name,
      m.therapeutic_category,
      m.manufacturer
    FROM medicine_strength ms
    JOIN medicines m ON ms.medicine_id = m.id
    WHERE ms.id = $1
    `,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findByMedicineId(medicineId: string): Promise<MedicineStrengthRow[]> {
  const result = await pool.query(
    `
    SELECT 
      ms.*,
      m.medicine_name,
      m.generic_name,
      m.therapeutic_category,
      m.manufacturer
    FROM medicine_strength ms
    JOIN medicines m ON ms.medicine_id = m.id
    WHERE ms.medicine_id = $1
    ORDER BY ms.created_at ASC
    `,
    [medicineId]
  );
  return result.rows;
}

export async function listVariants(
  query: QueryMedicineStrengthsInput
): Promise<{ items: MedicineStrengthRow[]; total: number }> {
  const conditions: string[] = [];
  const params: any[] = [];

  if (query.medicineId) {
    params.push(query.medicineId);
    conditions.push(`ms.medicine_id = $${params.length}`);
  }

  if (query.status && query.status !== 'ALL') {
    params.push(query.status);
    conditions.push(`ms.status = $${params.length}`);
  }

  if (query.dosage_form) {
    params.push(query.dosage_form);
    conditions.push(`LOWER(ms.dosage_form) = LOWER($${params.length})`);
  }

  if (query.stock_status) {
    if (query.stock_status === 'OUT_OF_STOCK') {
      conditions.push(`ms.available_quantity = 0`);
    } else if (query.stock_status === 'LOW_STOCK') {
      conditions.push(`ms.available_quantity > 0 AND ms.available_quantity <= ms.reorder_level`);
    } else if (query.stock_status === 'IN_STOCK') {
      conditions.push(`ms.available_quantity > ms.reorder_level`);
    }
  }

  if (query.search) {
    params.push(`%${query.search.trim()}%`);
    const pIdx = params.length;
    conditions.push(`(
      m.medicine_name ILIKE $${pIdx} OR 
      m.generic_name ILIKE $${pIdx} OR 
      ms.strength ILIKE $${pIdx} OR 
      ms.variant_code ILIKE $${pIdx} OR 
      ms.barcode ILIKE $${pIdx}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM medicine_strength ms
    JOIN medicines m ON ms.medicine_id = m.id
    ${whereClause}
    `,
    params
  );
  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  const offset = (query.page - 1) * query.limit;
  params.push(query.limit, offset);

  const itemsResult = await pool.query(
    `
    SELECT 
      ms.*,
      m.medicine_name,
      m.generic_name,
      m.therapeutic_category,
      m.manufacturer
    FROM medicine_strength ms
    JOIN medicines m ON ms.medicine_id = m.id
    ${whereClause}
    ORDER BY m.medicine_name ASC, ms.strength ASC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: itemsResult.rows,
    total,
  };
}

export async function createVariant(
  input: CreateMedicineStrengthInput & { final_price: number | null }
): Promise<MedicineStrengthRow> {
  const result = await pool.query(
    `
    INSERT INTO medicine_strength (
      medicine_id,
      strength,
      strength_unit,
      dosage_form,
      strip_count,
      tablets_per_strip,
      total_tablets,
      available_quantity,
      mrp,
      discount_type,
      discount_value,
      final_price,
      purchase_price,
      reorder_level,
      variant_code,
      barcode,
      status,
      notes
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
    )
    RETURNING *
    `,
    [
      input.medicineId,
      input.strength.trim(),
      input.strength_unit.trim(),
      input.dosage_form.trim(),
      input.strip_count ?? 0,
      input.tablets_per_strip ?? null,
      input.total_tablets ?? 0,
      input.available_quantity ?? 0,
      input.mrp ?? null,
      input.discount_type ?? null,
      input.discount_value ?? null,
      input.final_price ?? null,
      input.purchase_price ?? null,
      input.reorder_level ?? 10,
      input.variant_code?.trim() ?? null,
      input.barcode?.trim() ?? null,
      input.status ?? 'ACTIVE',
      input.notes?.trim() ?? null,
    ]
  );
  return result.rows[0];
}

export async function updateVariant(
  id: string,
  input: UpdateMedicineStrengthInput & { final_price?: number | null }
): Promise<MedicineStrengthRow | null> {
  const updates: string[] = [];
  const params: any[] = [id];

  const addField = (col: string, val: any) => {
    if (val !== undefined) {
      params.push(val);
      updates.push(`${col} = $${params.length}`);
    }
  };

  addField('strength', input.strength?.trim());
  addField('strength_unit', input.strength_unit?.trim());
  addField('dosage_form', input.dosage_form?.trim());
  addField('tablets_per_strip', input.tablets_per_strip);
  addField('mrp', input.mrp);
  addField('discount_type', input.discount_type);
  addField('discount_value', input.discount_value);
  addField('final_price', input.final_price);
  addField('purchase_price', input.purchase_price);
  addField('reorder_level', input.reorder_level);
  addField('variant_code', input.variant_code?.trim() || null);
  addField('barcode', input.barcode?.trim() || null);
  addField('status', input.status);
  addField('notes', input.notes?.trim() || null);

  if (updates.length === 0) {
    return findById(id);
  }

  updates.push(`updated_at = NOW()`);

  const result = await pool.query(
    `
    UPDATE medicine_strength
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
    `,
    params
  );
  return result.rows[0] ?? null;
}

export async function deleteVariant(id: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM medicine_strength WHERE id = $1 RETURNING id`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}
