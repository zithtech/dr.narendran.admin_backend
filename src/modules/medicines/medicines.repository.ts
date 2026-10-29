
function normalizeDiscountType(raw?: string | null): 'Percentage' | 'Fixed Amount' | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (s.includes('percent') || s === '%') return 'Percentage';
  if (s.includes('fixed') || s.includes('flat') || s.includes('amount') || s === '₹') return 'Fixed Amount';
  return null;
}

function calculateFinalPrice(
  mrp: number | null | undefined,
  discountType: string | null | undefined,
  discountValue: number | null | undefined
): number | null {
  if (mrp === null || mrp === undefined || isNaN(mrp)) return null;
  const numMrp = Number(mrp);
  const dt = discountType ? String(discountType).trim().toLowerCase() : '';
  if (dt.includes('percent') && discountValue !== null && discountValue !== undefined && !isNaN(discountValue)) {
    return Number(Math.max(0, numMrp - (numMrp * Number(discountValue)) / 100).toFixed(2));
  }
  if ((dt.includes('fixed') || dt.includes('flat') || dt.includes('amount')) && discountValue !== null && discountValue !== undefined && !isNaN(discountValue)) {
    return Number(Math.max(0, numMrp - Number(discountValue)).toFixed(2));
  }
  return Number(numMrp.toFixed(2));
}

import { pool } from '@/db/pool.js';
import { withTransaction } from '@/db/query.js';

import type {
  BulkImportInput,
  CreateMedicineInput,
  ListMedicinesQuery,
  UpdateMedicineInput,
  CreatePackageInput,
  UpdatePackageInput,
} from './medicines.schema.js';

function getField(obj: any, ...keys: string[]): string {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of keys) {
    const val = obj[k];
    if (val !== undefined && val !== null && val !== '') {
      return String(val).trim();
    }
  }
  return '';
}

export async function createMedicine(input: CreateMedicineInput) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sql = `
      INSERT INTO medicines (
        medicine_name, generic_name, strength, strength_unit, dosage_form,
        therapeutic_category, sub_category, manufacturer, prescription_required,
        status, medicine_code, barcode, mrp, discount_type, discount_value, final_price,
        frequency, duration, description
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      ) RETURNING *;
    `;
    const values = [
      input.medicineName,
      input.genericName || null,
      input.strength || null,
      input.strengthUnit || null,
      input.dosageForm || null,
      input.therapeuticCategory || null,
      input.subCategory || null,
      input.manufacturer || null,
      input.prescriptionRequired ?? false,
      input.status || 'Active',
      input.medicineCode || null,
      input.barcode || null,
      input.mrp ?? null,
      normalizeDiscountType(input.discountType),
      input.discountValue ?? null,
      calculateFinalPrice(input.mrp, normalizeDiscountType(input.discountType), input.discountValue),
      input.frequency || null,
      input.duration || null,
      input.description || null,
    ];
    const { rows } = await client.query(sql, values);
    const createdMedicine = rows[0] || null;

    if (createdMedicine) {
      if (input.initialVariants && input.initialVariants.length > 0) {
        for (const v of input.initialVariants) {
          const discountType = v.discountType ? normalizeDiscountType(v.discountType) : null;
          const finalPrice = calculateFinalPrice(v.mrp, discountType, v.discountValue);
          const varStatus = (v.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

          await client.query(
            `
            INSERT INTO medicine_strength (
              medicine_id, strength, strength_unit, dosage_form,
              strip_count, tablets_per_strip, total_tablets, available_quantity,
              mrp, discount_type, discount_value, final_price, purchase_price,
              reorder_level, variant_code, barcode, status, notes
            ) VALUES (
              $1, $2, $3, $4, 0, $5, 0, 0, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
            ) ON CONFLICT DO NOTHING
            `,
            [
              createdMedicine.id,
              v.strength.trim(),
              v.strengthUnit.trim(),
              v.dosageForm.trim(),
              v.tabletsPerStrip ?? null,
              v.mrp ?? null,
              discountType,
              v.discountValue ?? null,
              finalPrice,
              v.purchasePrice ?? null,
              v.reorderLevel ?? 10,
              v.variantCode || null,
              v.barcode || null,
              varStatus,
              v.notes || null,
            ]
          );
        }
      } else if (input.strength || input.dosageForm) {
        // Seed baseline variant from medicine level fields
        const discountType = input.discountType ? normalizeDiscountType(input.discountType) : null;
        const finalPrice = calculateFinalPrice(input.mrp, discountType, input.discountValue);
        const varStatus = input.status === 'Inactive' ? 'INACTIVE' : 'ACTIVE';

        await client.query(
          `
          INSERT INTO medicine_strength (
            medicine_id, strength, strength_unit, dosage_form,
            strip_count, tablets_per_strip, total_tablets, available_quantity,
            mrp, discount_type, discount_value, final_price, purchase_price,
            reorder_level, variant_code, barcode, status, notes
          ) VALUES (
            $1, $2, $3, $4, 0, 10, 0, 0, $5, $6, $7, $8, null, 10, $9, $10, $11, 'Initial baseline variant'
          ) ON CONFLICT DO NOTHING
          `,
          [
            createdMedicine.id,
            (input.strength || 'Standard').trim(),
            (input.strengthUnit || 'Unit').trim(),
            (input.dosageForm || 'Tablet').trim(),
            input.mrp ?? null,
            discountType,
            input.discountValue ?? null,
            finalPrice,
            input.medicineCode || null,
            input.barcode || null,
            varStatus,
          ]
        );
      }

      const variantsRes = await client.query(
        'SELECT * FROM medicine_strength WHERE medicine_id = $1 ORDER BY created_at ASC',
        [createdMedicine.id]
      );
      createdMedicine.variants = variantsRes.rows;
    }

    await client.query('COMMIT');
    return createdMedicine;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateMedicine(id: string, input: UpdateMedicineInput) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (input.mrp !== undefined || input.discountType !== undefined || input.discountValue !== undefined) {
      const existingRes = await client.query('SELECT mrp, discount_type, discount_value FROM medicines WHERE id = $1', [id]);
      if (existingRes.rows.length > 0) {
        const ex = existingRes.rows[0];
        const effMrp = input.mrp !== undefined ? input.mrp : (ex.mrp !== null ? Number(ex.mrp) : null);
        const effType = input.discountType !== undefined ? normalizeDiscountType(input.discountType) : ex.discount_type;
        const effVal = input.discountValue !== undefined ? input.discountValue : (ex.discount_value !== null ? Number(ex.discount_value) : null);
        input.finalPrice = calculateFinalPrice(effMrp, effType, effVal);
      }
    }
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;

    for (const [key, value] of Object.entries(input)) {
      if (value === undefined || key === 'initialVariants' || key === 'variants') continue;
      const column = key.replace(/[A-Z]/g, (letter) => '_' + letter.toLowerCase());
      fields.push('"' + column + '" = $' + index);
      values.push(value);
      index++;
    }

    fields.push('updated_at = current_timestamp');
    values.push(id);

    const sql = `
      UPDATE medicines SET ${fields.join(', ')}
      WHERE id = $${index}
      RETURNING *;
    `;
    const { rows } = await client.query(sql, values);
    const updatedMedicine = rows[0] || null;

    const variantsList = input.initialVariants || (input as any).variants;
    if (variantsList && variantsList.length > 0) {
      for (const v of variantsList) {
        const discountType = v.discountType ? normalizeDiscountType(v.discountType) : null;
        const finalPrice = calculateFinalPrice(v.mrp, discountType, v.discountValue);
        const varStatus = (v.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

        if (v.id) {
          await client.query(
            `
            UPDATE medicine_strength SET
              strength = $1, strength_unit = $2, dosage_form = $3,
              tablets_per_strip = $4, mrp = $5, discount_type = $6,
              discount_value = $7, final_price = $8, purchase_price = $9,
              reorder_level = $10, variant_code = $11, barcode = $12,
              status = $13, notes = $14, updated_at = current_timestamp
            WHERE id = $15 AND medicine_id = $16
            `,
            [
              v.strength.trim(),
              (v.strengthUnit || 'mg').trim(),
              (v.dosageForm || 'Tablet').trim(),
              v.tabletsPerStrip ?? null,
              v.mrp ?? null,
              discountType,
              v.discountValue ?? null,
              finalPrice,
              v.purchasePrice ?? null,
              v.reorderLevel ?? 10,
              v.variantCode || null,
              v.barcode || null,
              varStatus,
              v.notes || null,
              v.id,
              id,
            ]
          );
        } else {
          await client.query(
            `
            INSERT INTO medicine_strength (
              medicine_id, strength, strength_unit, dosage_form,
              strip_count, tablets_per_strip, total_tablets, available_quantity,
              mrp, discount_type, discount_value, final_price, purchase_price,
              reorder_level, variant_code, barcode, status, notes
            ) VALUES (
              $1, $2, $3, $4, 0, $5, 0, 0, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
            ) ON CONFLICT DO NOTHING
            `,
            [
              id,
              v.strength.trim(),
              (v.strengthUnit || 'mg').trim(),
              (v.dosageForm || 'Tablet').trim(),
              v.tabletsPerStrip ?? null,
              v.mrp ?? null,
              discountType,
              v.discountValue ?? null,
              finalPrice,
              v.purchasePrice ?? null,
              v.reorderLevel ?? 10,
              v.variantCode || null,
              v.barcode || null,
              varStatus,
              v.notes || null,
            ]
          );
        }
      }
    }

    if (updatedMedicine) {
      const variantsRes = await client.query(
        'SELECT * FROM medicine_strength WHERE medicine_id = $1 ORDER BY created_at ASC',
        [id]
      );
      updatedMedicine.variants = variantsRes.rows;
    }

    await client.query('COMMIT');
    return updatedMedicine;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getMedicineById(id: string) {
  const client = await pool.connect();
  try {
    const sql = `
      SELECT m.*,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', ms.id,
                'strength', ms.strength,
                'strength_unit', ms.strength_unit,
                'dosage_form', ms.dosage_form,
                'strip_count', ms.strip_count,
                'tablets_per_strip', ms.tablets_per_strip,
                'total_tablets', ms.total_tablets,
                'available_quantity', ms.available_quantity,
                'mrp', ms.mrp,
                'discount_type', ms.discount_type,
                'discount_value', ms.discount_value,
                'final_price', ms.final_price,
                'purchase_price', ms.purchase_price,
                'reorder_level', ms.reorder_level,
                'variant_code', ms.variant_code,
                'barcode', ms.barcode,
                'status', ms.status,
                'notes', ms.notes,
                'created_at', ms.created_at,
                'updated_at', ms.updated_at
              ) ORDER BY ms.created_at ASC
            )
            FROM medicine_strength ms
            WHERE ms.medicine_id = m.id
          ),
          '[]'::json
        ) AS variants
      FROM medicines m
      WHERE m.id = $1
    `;
    const { rows } = await client.query(sql, [id]);
    return rows[0] || null;
  } finally {
    client.release();
  }
}

export async function listMedicines(params: ListMedicinesQuery) {
  const client = await pool.connect();
  try {
    let whereClause = 'WHERE 1=1';
    const values = [];
    let index = 1;

    if (params.search?.trim()) {
      whereClause += ` AND (m.medicine_name ILIKE $${index} OR m.generic_name ILIKE $${index} OR m.medicine_code ILIKE $${index} OR m.barcode ILIKE $${index} OR m.manufacturer ILIKE $${index})`;
      values.push(`%${params.search.trim()}%`);
      index++;
    }

    if (params.status) {
      whereClause += ` AND m.status = $${index}`;
      values.push(params.status);
      index++;
    }

    if (params.category?.trim()) {
      whereClause += ` AND m.therapeutic_category ILIKE $${index}`;
      values.push(`%${params.category.trim()}%`);
      index++;
    }

    if (params.dosageForm?.trim()) {
      whereClause += ` AND (m.dosage_form ILIKE $${index} OR EXISTS (
        SELECT 1 FROM medicine_strength ms 
        WHERE ms.medicine_id = m.id AND ms.dosage_form ILIKE $${index}
      ))`;
      values.push(`%${params.dosageForm.trim()}%`);
      index++;
    }

    const countSql = `SELECT COUNT(*) FROM medicines m ${whereClause}`;
    const countValues = [...values];

    const sql = `
      SELECT m.*,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', ms.id,
                'strength', ms.strength,
                'strength_unit', ms.strength_unit,
                'dosage_form', ms.dosage_form,
                'strip_count', ms.strip_count,
                'tablets_per_strip', ms.tablets_per_strip,
                'total_tablets', ms.total_tablets,
                'available_quantity', ms.available_quantity,
                'mrp', ms.mrp,
                'discount_type', ms.discount_type,
                'discount_value', ms.discount_value,
                'final_price', ms.final_price,
                'purchase_price', ms.purchase_price,
                'reorder_level', ms.reorder_level,
                'variant_code', ms.variant_code,
                'barcode', ms.barcode,
                'status', ms.status,
                'notes', ms.notes,
                'created_at', ms.created_at,
                'updated_at', ms.updated_at
              ) ORDER BY ms.created_at ASC
            )
            FROM medicine_strength ms
            WHERE ms.medicine_id = m.id
          ),
          '[]'::json
        ) AS variants
      FROM medicines m
      ${whereClause}
      ORDER BY m.medicine_name ASC
      LIMIT $${index} OFFSET $${index + 1}
    `;
    values.push(params.limit, params.offset);

    const { rows } = await client.query(sql, values);
    const countRes = await client.query(countSql, countValues);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    return { medicines: rows, total };
  } finally {
    client.release();
  }
}

export async function softDeleteMedicine(id: string) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "UPDATE medicines SET status = 'Inactive', updated_at = current_timestamp WHERE id = $1 RETURNING *",
      [id]
    );
    return rows[0] || null;
  } finally {
    client.release();
  }
}

export async function bulkValidateMedicines(rawMedicines: any[]) {
  const client = await pool.connect();
  try {
    const medRes = await client.query('SELECT id, medicine_name, medicine_code FROM medicines');
    const existingMeds = medRes.rows || [];

    const varRes = await client.query(
      'SELECT id, medicine_id, strength, strength_unit, dosage_form, tablets_per_strip, available_quantity FROM medicine_strength'
    );
    const existingVars = varRes.rows || [];

    const codeToMed = new Map();
    const nameToMed = new Map();
    for (const m of existingMeds) {
      if (m.medicine_code) codeToMed.set(m.medicine_code.trim().toLowerCase(), m);
      if (m.medicine_name) nameToMed.set(m.medicine_name.trim().toLowerCase(), m);
    }

    const medVarSet = new Set();
    for (const v of existingVars) {
      const vKey = `${v.medicine_id}|${(v.strength || '').trim().toLowerCase()}|${(v.strength_unit || '').trim().toLowerCase()}|${(v.dosage_form || '').trim().toLowerCase()}|${v.tablets_per_strip || 1}`;
      medVarSet.add(vKey);
    }

    let newCount = 0;
    let alreadyExistingCount = 0;
    let duplicateInExcelCount = 0;
    let invalidCount = 0;

    const previewRows = [];
    const seenBatchKeys = new Set();

    for (let i = 0; i < rawMedicines.length; i++) {
      const row = rawMedicines[i] || {};
      const rowNum = i + 1;
      const issues = [];

      const medicineName = getField(row, 'medicineName', 'medicine_name', 'Medicine Name', 'Name', 'name');
      if (!medicineName) {
        issues.push('Medicine Name is required');
      }

      const code = getField(row, 'medicineCode', 'medicine_code', 'Medicine Code', 'code', 'sku');
      const genericName = getField(row, 'genericName', 'generic_name', 'Generic Name', 'generic');
      const strength = getField(row, 'strength', 'Strength') || 'Standard';
      const strengthUnit = getField(row, 'strengthUnit', 'strength_unit', 'Strength Unit', 'unit') || 'Unit';
      const dosageForm = getField(row, 'dosageForm', 'dosage_form', 'Dosage Form', 'form') || 'Tablet';
      const category = getField(row, 'therapeuticCategory', 'therapeutic_category', 'Therapeutic Category', 'category');
      const subCategory = getField(row, 'subCategory', 'sub_category', 'Sub Category');
      const manufacturer = getField(row, 'manufacturer', 'Manufacturer', 'company');
      const barcode = getField(row, 'barcode', 'Barcode');
      const variantCode = getField(row, 'variantCode', 'variant_code', 'Variant Code');
      const notes = getField(row, 'notes', 'Notes');

      const tabsPerStripRaw = getField(row, 'tabletsPerStrip', 'tablets_per_strip', 'Tablets Per Strip');
      let tabletsPerStrip = null;
      if (tabsPerStripRaw !== undefined && tabsPerStripRaw !== null && tabsPerStripRaw !== '') {
        const parsed = parseInt(String(tabsPerStripRaw), 10);
        if (isNaN(parsed) || parsed <= 0) {
          issues.push('Tablets per strip must be a positive integer');
        } else {
          tabletsPerStrip = parsed;
        }
      }

      const openStockRaw = getField(row, 'openingStock', 'opening_stock', 'Opening Stock');
      let openingStock = 0;
      if (openStockRaw !== undefined && openStockRaw !== null && openStockRaw !== '') {
        const parsed = parseInt(String(openStockRaw), 10);
        if (isNaN(parsed) || parsed < 0) {
          issues.push('Opening stock must be a non-negative integer');
        } else {
          openingStock = parsed;
        }
      }

      const mrpRaw = getField(row, 'mrp', 'MRP', 'price', 'Price');
      let mrp = null;
      if (mrpRaw !== undefined && mrpRaw !== null && mrpRaw !== '') {
        const parsed = parseFloat(String(mrpRaw));
        if (isNaN(parsed) || parsed < 0) {
          issues.push('MRP must be a positive number');
        } else {
          mrp = parsed;
        }
      }

      const discountTypeRaw = getField(row, 'discountType', 'discount_type', 'Discount Type');
      const discountType = normalizeDiscountType(discountTypeRaw);
      if (discountTypeRaw && !discountType) {
        issues.push('Discount Type must be Percentage or Fixed Amount');
      }

      const dvRaw = getField(row, 'discountValue', 'discount_value', 'Discount Value');
      let discountValue = null;
      if (dvRaw !== undefined && dvRaw !== null && dvRaw !== '') {
        const parsed = parseFloat(String(dvRaw));
        if (isNaN(parsed) || parsed < 0) {
          issues.push('Discount value must be a positive number');
        } else if (discountType === 'Percentage' && parsed > 100) {
          issues.push('Percentage discount cannot exceed 100%');
        } else if (discountType === 'Fixed Amount' && mrp !== null && parsed > mrp) {
          issues.push('Flat discount cannot exceed MRP');
        } else {
          discountValue = parsed;
        }
      }

      const purchasePriceRaw = getField(row, 'purchasePrice', 'purchase_price', 'Purchase Price');
      let purchasePrice = null;
      if (purchasePriceRaw !== undefined && purchasePriceRaw !== null && purchasePriceRaw !== '') {
        const parsed = parseFloat(String(purchasePriceRaw));
        if (isNaN(parsed) || parsed < 0) {
          issues.push('Purchase price must be a positive number');
        } else {
          purchasePrice = parsed;
        }
      }

      const finalPrice = calculateFinalPrice(mrp, discountType, discountValue);

      // Check master identification
      let existingMed = null;
      if (code && codeToMed.has(code.toLowerCase())) {
        existingMed = codeToMed.get(code.toLowerCase());
      } else if (medicineName && nameToMed.has(medicineName.toLowerCase())) {
        existingMed = nameToMed.get(medicineName.toLowerCase());
      }

      const medicineAction = existingMed ? 'EXISTING_MEDICINE' : 'NEW_MEDICINE';
      const medId = existingMed ? existingMed.id : 'NEW_GROUP:' + (code ? code.toLowerCase() : (medicineName ? medicineName.toLowerCase() : ''));

      const variantKey = `${medId}|${strength.toLowerCase()}|${strengthUnit.toLowerCase()}|${dosageForm.toLowerCase()}|${tabletsPerStrip || 1}`;

      let classification = 'NEW';
      let variantAction = 'NEW_VARIANT';
      let duplicateReason = null;
      let isDuplicate = false;

      if (issues.length > 0) {
        classification = 'INVALID';
        invalidCount++;
      } else if (existingMed && medVarSet.has(`${existingMed.id}|${strength.toLowerCase()}|${strengthUnit.toLowerCase()}|${dosageForm.toLowerCase()}|${tabletsPerStrip || 1}`)) {
        classification = 'ALREADY_EXISTS';
        variantAction = 'EXISTING_VARIANT';
        duplicateReason = `Variant already exists in database (${strength} ${strengthUnit})`;
        isDuplicate = true;
        alreadyExistingCount++;
      } else if (seenBatchKeys.has(variantKey)) {
        classification = 'DUPLICATE_IN_EXCEL';
        variantAction = 'DUPLICATE';
        duplicateReason = 'Duplicate row within this Excel file';
        isDuplicate = true;
        duplicateInExcelCount++;
      } else {
        classification = 'NEW';
        variantAction = 'NEW_VARIANT';
        seenBatchKeys.add(variantKey);
        newCount++;
      }

      previewRows.push({
        rowNumber: rowNum,
        medicineName: medicineName || 'Unnamed Medicine',
        genericName: genericName || null,
        medicineCode: code || null,
        strength: `${strength} ${strengthUnit}`.trim(),
        dosageForm: dosageForm || 'Tablet',
        tabletsPerStrip,
        openingStock,
        mrp,
        discountType,
        discountValue,
        finalPrice,
        purchasePrice,
        reorderLevel: 10,
        variantCode: variantCode || null,
        notes: notes || null,
        status: 'Active',
        classification,
        medicineAction,
        variantAction,
        isValid: issues.length === 0,
        isDuplicate,
        issues,
        duplicateReason,
        data: {
          medicineName: medicineName || '',
          genericName: genericName || null,
          strength,
          strengthUnit,
          dosageForm,
          tabletsPerStrip,
          openingStock,
          mrp,
          discountType,
          discountValue,
          finalPrice,
          purchasePrice,
          reorderLevel: 10,
          variantCode: variantCode || null,
          barcode: barcode || null,
          medicineCode: code || null,
          status: 'Active',
          notes: notes || null,
        },
      });
    }

    return {
      totalRows: rawMedicines.length,
      newRows: newCount,
      alreadyExistingRows: alreadyExistingCount,
      duplicateInExcelRows: duplicateInExcelCount,
      invalidRows: invalidCount,
      previewRows,
    };
  } finally {
    client.release();
  }
}

export async function bulkImportMedicines(input: BulkImportInput) {
  return withTransaction(async (tx) => {
    // 1. Group rows by master medicine
    const groups = new Map();

    for (let i = 0; i < input.medicines.length; i++) {
      const item = input.medicines[i];
      if (!item) continue;
      const rowNum = i + 1;

      const codeKey = item.medicineCode ? item.medicineCode.trim().toLowerCase() : null;
      const nameKey = (item.medicineName || '').trim().toLowerCase();
      const groupKey = codeKey ? `code:${codeKey}` : `name:${nameKey}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          medicineCode: item.medicineCode?.trim() || null,
          medicineName: item.medicineName?.trim() || '',
          primaryItem: item,
          rows: [],
        });
      }
      groups.get(groupKey).rows.push({ item, rowNum });
    }

    let createdMedicinesCount = 0;
    let updatedMedicinesCount = 0;
    let createdVariantsCount = 0;
    let updatedVariantsCount = 0;
    let skippedVariantsCount = 0;
    let stockInitializedCount = 0;
    let failedCount = 0;

    const errors = [];
    const skipped = [];
    const seenVariantsInBatch = new Set();

    for (const [groupKey, group] of groups.entries()) {
      let medicineId = null;

      try {
        let existingMed: { id: string } | null = null;
        if (group.medicineCode) {
          existingMed = await tx.queryOne<{ id: string }>(
            'SELECT id, medicine_name, medicine_code FROM medicines WHERE lower(trim(medicine_code)) = lower(trim($1))',
            [group.medicineCode]
          );
        }
        if (!existingMed && group.medicineName) {
          existingMed = await tx.queryOne<{ id: string }>(
            'SELECT id, medicine_name, medicine_code FROM medicines WHERE lower(trim(medicine_name)) = lower(trim($1))',
            [group.medicineName]
          );
        }

        if (existingMed) {
          medicineId = existingMed.id;
          if (input.strategy === 'UPDATE_EXISTING') {
            const pi = group.primaryItem;
            await tx.query(
              `UPDATE medicines SET
                generic_name = COALESCE($1, generic_name),
                manufacturer = COALESCE($2, manufacturer),
                therapeutic_category = COALESCE($3, therapeutic_category),
                sub_category = COALESCE($4, sub_category),
                description = COALESCE($5, description),
                updated_at = NOW()
              WHERE id = $6`,
              [
                pi.genericName || null,
                pi.manufacturer || null,
                pi.therapeuticCategory || null,
                pi.subCategory || null,
                pi.description || null,
                medicineId,
              ]
            );
            updatedMedicinesCount++;
          }
        } else {
          const pi = group.primaryItem;
          const insertedMed = await tx.queryOne<{ id: string }>(
            `INSERT INTO medicines (
              medicine_name, generic_name, strength, strength_unit, dosage_form,
              therapeutic_category, sub_category, manufacturer, prescription_required,
              status, medicine_code, barcode, mrp, discount_type, discount_value, final_price,
              frequency, duration, description
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
            ) RETURNING id`,
            [
              group.medicineName,
              pi.genericName || null,
              pi.strength || null,
              pi.strengthUnit || null,
              pi.dosageForm || null,
              pi.therapeuticCategory || null,
              pi.subCategory || null,
              pi.manufacturer || null,
              pi.prescriptionRequired ?? false,
              'Active',
              group.medicineCode || null,
              pi.barcode || null,
              pi.mrp ?? null,
              pi.discountType || null,
              pi.discountValue ?? null,
              pi.finalPrice ?? null,
              pi.frequency || null,
              pi.duration || null,
              pi.description || null,
            ]
          );
          if (!insertedMed) {
            throw new Error('Failed to create medicine master record');
          }
          medicineId = insertedMed.id;
          createdMedicinesCount++;
        }
      } catch (err) {
        for (const r of group.rows) {
          failedCount++;
          errors.push({
            row: r.rowNum,
            medicineName: group.medicineName,
            error: err instanceof Error ? err.message : 'Database master insert error',
          });
        }
        continue;
      }

      // Process variants for this master
      for (const { item, rowNum } of group.rows) {
        const strStrength = (item.strength || 'Standard').trim();
        const strUnit = (item.strengthUnit || 'Unit').trim();
        const strDosage = (item.dosageForm || 'Tablet').trim();
        const tabsPerStrip = item.tabletsPerStrip ?? null;
        const varKey = `${groupKey}|${strStrength.toLowerCase()}|${strUnit.toLowerCase()}|${strDosage.toLowerCase()}|${tabsPerStrip || 1}`;

        if (seenVariantsInBatch.has(varKey)) {
          skippedVariantsCount++;
          skipped.push({
            row: rowNum,
            medicineName: group.medicineName,
            reason: 'Duplicate row in Excel file',
          });
          continue;
        }
        seenVariantsInBatch.add(varKey);

        const discountType = normalizeDiscountType(item.discountType);
        const finalPrice = calculateFinalPrice(item.mrp, discountType, item.discountValue);
        const varStatus = (item.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

        try {
          const existingVariant = await tx.queryOne<{ id: string; available_quantity: number; strip_count: number; total_tablets: number }>(
            `SELECT id, available_quantity, strip_count, total_tablets
             FROM medicine_strength
             WHERE medicine_id = $1
               AND lower(trim(strength)) = lower(trim($2))
               AND lower(trim(strength_unit)) = lower(trim($3))
               AND lower(trim(dosage_form)) = lower(trim($4))
               AND COALESCE(tablets_per_strip, 1) = COALESCE($5, 1)`,
            [medicineId, strStrength, strUnit, strDosage, tabsPerStrip]
          );

          if (existingVariant) {
            if (input.strategy === 'SKIP_EXISTING') {
              skippedVariantsCount++;
              skipped.push({
                row: rowNum,
                medicineName: group.medicineName,
                reason: `Variant already exists in database (${strStrength} ${strUnit})`,
              });
            } else if (input.strategy === 'UPDATE_EXISTING') {
              await tx.query(
                `UPDATE medicine_strength SET
                  mrp = COALESCE($1, mrp),
                  discount_type = COALESCE($2, discount_type),
                  discount_value = COALESCE($3, discount_value),
                  final_price = COALESCE($4, final_price),
                  purchase_price = COALESCE($5, purchase_price),
                  reorder_level = COALESCE($6, reorder_level),
                  variant_code = COALESCE($7, variant_code),
                  barcode = COALESCE($8, barcode),
                  status = COALESCE($9, status),
                  notes = COALESCE($10, notes),
                  updated_at = NOW()
                WHERE id = $11`,
                [
                  item.mrp ?? null,
                  discountType,
                  item.discountValue ?? null,
                  finalPrice,
                  item.purchasePrice ?? null,
                  item.reorderLevel ?? null,
                  item.variantCode || null,
                  item.barcode || null,
                  varStatus,
                  item.notes || null,
                  existingVariant.id,
                ]
              );
              updatedVariantsCount++;
            }
          } else {
            // New variant
            const openingStock = Math.max(0, item.openingStock ?? 0);
            const stripCount = tabsPerStrip && tabsPerStrip > 0 ? Math.floor(openingStock / tabsPerStrip) : 0;
            const totalTablets = tabsPerStrip ? openingStock : 0;

            const insertedVariant = await tx.queryOne<{ id: string }>(
              `INSERT INTO medicine_strength (
                medicine_id, strength, strength_unit, dosage_form,
                strip_count, tablets_per_strip, total_tablets, available_quantity,
                mrp, discount_type, discount_value, final_price, purchase_price,
                reorder_level, variant_code, barcode, status, notes
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
              ) RETURNING id`,
              [
                medicineId,
                strStrength,
                strUnit,
                strDosage,
                stripCount,
                tabsPerStrip,
                totalTablets,
                openingStock,
                item.mrp ?? null,
                discountType,
                item.discountValue ?? null,
                finalPrice,
                item.purchasePrice ?? null,
                item.reorderLevel ?? 10,
                item.variantCode || null,
                item.barcode || null,
                varStatus,
                item.notes || null,
              ]
            );

            if (!insertedVariant) {
              throw new Error('Failed to create medicine strength variant');
            }

            createdVariantsCount++;

            if (openingStock > 0) {
              await tx.query(
                `INSERT INTO medicine_stock_history (
                  medicine_strength_id, transaction_type, quantity_change,
                  quantity_before, quantity_after, unit_cost, reference_number,
                  reason, notes, performed_by
                ) VALUES (
                  $1, 'OPENING_STOCK', $2, 0, $2, $3, 'EXCEL-IMPORT',
                  'Initial opening stock from Excel import', $4, null
                )`,
                [
                  insertedVariant.id,
                  openingStock,
                  item.purchasePrice ?? null,
                  item.notes || null,
                ]
              );
              stockInitializedCount++;
            }
          }
        } catch (err) {
          failedCount++;
          errors.push({
            row: rowNum,
            medicineName: group.medicineName,
            error: err instanceof Error ? err.message : 'Database variant insert error',
          });
        }
      }
    }

    const duplicateInExcelCount = skipped.filter((s) => s.reason.includes('Duplicate row')).length;

    return {
      totalRows: input.medicines.length,
      successCount: createdVariantsCount + updatedVariantsCount,
      insertedCount: createdVariantsCount,
      alreadyExistingCount: skippedVariantsCount - duplicateInExcelCount,
      duplicateInExcelCount,
      createdMedicinesCount,
      updatedMedicinesCount,
      createdVariantsCount,
      updatedVariantsCount,
      skippedVariantsCount,
      stockInitializedCount,
      failedCount,
      errors,
      skipped,
    };
  });
}


export async function listPackages(doctorId: string) {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.doctor_id,
       COALESCE((SELECT json_agg(json_build_object(
         'id', m.id,
         'medicine_name', m.medicine_name,
         'dosage_form', m.dosage_form,
         'strength', m.strength,
         'duration', m.duration,
         'frequency', m.frequency
       )) FROM medicine_package_items i
       JOIN medicines m ON i.medicine_id = m.id
       WHERE i.package_id = p.id), '[]'::json) as medicines
     FROM medicine_packages p
     WHERE p.doctor_id = $1
     ORDER BY p.created_at DESC`,
    [doctorId]
  );
  return rows;
}

export async function createPackage(doctorId: string, input: CreatePackageInput) {
  return withTransaction(async (client) => {
    const rows = await client.query<any>(
      `INSERT INTO medicine_packages (doctor_id, name) VALUES ($1, $2) RETURNING *`,
      [doctorId, input.name]
    );
    const pkg = rows[0];

    for (const medId of input.medicineIds) {
      await client.query(
        `INSERT INTO medicine_package_items (package_id, medicine_id) VALUES ($1, $2)`,
        [pkg.id, medId]
      );
    }
    
    return pkg;
  });
}

export async function updatePackage(id: string, doctorId: string, input: UpdatePackageInput) {
  return withTransaction(async (client) => {
    const rows = await client.query<any>(
      `UPDATE medicine_packages SET name = $1, updated_at = current_timestamp WHERE id = $2 AND doctor_id = $3 RETURNING *`,
      [input.name, id, doctorId]
    );
    if (rows.length === 0) throw new Error("Package not found or you do not have permission");
    const pkg = rows[0];

    await client.query(`DELETE FROM medicine_package_items WHERE package_id = $1`, [id]);

    for (const medId of input.medicineIds) {
      await client.query(
        `INSERT INTO medicine_package_items (package_id, medicine_id) VALUES ($1, $2)`,
        [pkg.id, medId]
      );
    }

    return pkg;
  });
}

export async function deletePackage(id: string, doctorId: string) {
  await pool.query(`DELETE FROM medicine_packages WHERE id = $1 AND doctor_id = $2`, [id, doctorId]);
}

