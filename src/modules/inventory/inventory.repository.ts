import { pool } from '@/db/pool.js';
import { withTransaction } from '@/db/query.js';
import type { QueryAllHistoryInput, QueryHistoryInput } from './inventory.schema.js';

export interface StockHistoryRow {
  id: string;
  medicine_strength_id: string;
  medicine_id?: string;
  medicine_name?: string;
  generic_name?: string;
  strength?: string;
  strength_unit?: string;
  dosage_form?: string;
  transaction_type: string;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  unit_cost: number | null;
  reference_number: string | null;
  reason: string | null;
  notes: string | null;
  performed_by: string | null;
  performer_name?: string | null;
  performer_email?: string | null;
  created_at: string;
}

export interface InventorySummaryStats {
  total_active_variants: number;
  in_stock_count: number;
  low_stock_count: number;
  out_of_stock_count: number;
  total_valuation: number;
}

export interface ReduceSummaryStats {
  today_tablets_reduced: number;
  today_transactions_count: number;
  total_tablets_reduced: number;
  total_transactions_count: number;
  in_stock_variants: number;
  low_stock_variants: number;
}

export async function executeStockMovement(params: {
  medicineStrengthId: string;
  transactionType: string;
  quantityDelta: number; // positive or negative
  unitCost?: number | null | undefined;
  referenceNumber?: string | null | undefined;
  reason?: string | null | undefined;
  notes?: string | null | undefined;
  performedBy?: string | null | undefined;
  allowNegative?: boolean | undefined;
}): Promise<{
  updatedVariant: any;
  historyRecord: StockHistoryRow;
}> {
  return withTransaction(async (tx) => {
    // 1. Lock the medicine strength row for update
    const variant = await tx.queryOne<any>(
      `
      SELECT 
        id, medicine_id, available_quantity, tablets_per_strip, reorder_level
      FROM medicine_strength
      WHERE id = $1
      FOR UPDATE
      `,
      [params.medicineStrengthId]
    );

    if (!variant) {
      throw new Error('MEDICINE_VARIANT_NOT_FOUND');
    }

    const qtyBefore = variant.available_quantity;
    const qtyAfter = qtyBefore + params.quantityDelta;

    if (qtyAfter < 0 && !params.allowNegative) {
      throw new Error('INSUFFICIENT_STOCK');
    }

    const tabsPerStrip = variant.tablets_per_strip;
    const stripCount = tabsPerStrip && tabsPerStrip > 0 ? Math.floor(qtyAfter / tabsPerStrip) : 0;
    const totalTablets = tabsPerStrip ? qtyAfter : 0;

    // 2. Update medicine_strength balance
    const updatedVariant = await tx.queryOne<any>(
      `
      UPDATE medicine_strength
      SET 
        available_quantity = $1,
        strip_count = $2,
        total_tablets = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
      `,
      [qtyAfter, stripCount, totalTablets, params.medicineStrengthId]
    );

    // 3. Insert append-only stock history record
    const historyRecord = await tx.queryOne<StockHistoryRow>(
      `
      INSERT INTO medicine_stock_history (
        medicine_strength_id,
        transaction_type,
        quantity_change,
        quantity_before,
        quantity_after,
        unit_cost,
        reference_number,
        reason,
        notes,
        performed_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )
      RETURNING *
      `,
      [
        params.medicineStrengthId,
        params.transactionType,
        params.quantityDelta,
        qtyBefore,
        qtyAfter,
        params.unitCost ?? null,
        params.referenceNumber?.trim() || null,
        params.reason?.trim() || null,
        params.notes?.trim() || null,
        params.performedBy ?? null,
      ]
    );

    return {
      updatedVariant,
      historyRecord: historyRecord!,
    };
  });
}

export async function getHistory(
  medicineStrengthId: string,
  query: QueryHistoryInput
): Promise<{ items: StockHistoryRow[]; total: number }> {
  const conditions: string[] = ['msh.medicine_strength_id = $1'];
  const params: any[] = [medicineStrengthId];

  if (query.transaction_type) {
    params.push(query.transaction_type);
    conditions.push(`msh.transaction_type = $${params.length}`);
  }

  if (query.start_date) {
    params.push(query.start_date);
    conditions.push(`msh.created_at >= $${params.length}`);
  }

  if (query.end_date) {
    params.push(query.end_date);
    conditions.push(`msh.created_at <= $${params.length}`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM medicine_stock_history msh
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
      msh.*,
      ms.medicine_id,
      m.medicine_name,
      ms.strength,
      ms.strength_unit,
      ms.dosage_form,
      u.full_name AS performer_name,
      u.email AS performer_email
    FROM medicine_stock_history msh
    JOIN medicine_strength ms ON msh.medicine_strength_id = ms.id
    JOIN medicines m ON ms.medicine_id = m.id
    LEFT JOIN users u ON msh.performed_by = u.id
    ${whereClause}
    ORDER BY msh.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: itemsResult.rows,
    total,
  };
}

export async function executeBatchStockMovement(params: {
  items: Array<{
    medicineStrengthId: string;
    transactionType: string;
    quantityDelta: number;
    unitCost?: number | null | undefined;
    referenceNumber?: string | null | undefined;
    reason?: string | null | undefined;
    notes?: string | null | undefined;
  }>;
  performedBy?: string | null | undefined;
}): Promise<Array<{ updatedVariant: any; historyRecord: StockHistoryRow }>> {
  return withTransaction(async (tx) => {
    const results: Array<{ updatedVariant: any; historyRecord: StockHistoryRow }> = [];

    for (const item of params.items) {
      const variant = await tx.queryOne<any>(
        `
        SELECT 
          id, medicine_id, available_quantity, tablets_per_strip, reorder_level
        FROM medicine_strength
        WHERE id = $1
        FOR UPDATE
        `,
        [item.medicineStrengthId]
      );

      if (!variant) {
        throw new Error(`MEDICINE_VARIANT_NOT_FOUND:${item.medicineStrengthId}`);
      }

      const qtyBefore = variant.available_quantity;
      const qtyAfter = qtyBefore + item.quantityDelta;

      if (qtyAfter < 0) {
        throw new Error(`INSUFFICIENT_STOCK:${item.medicineStrengthId}`);
      }

      const tabsPerStrip = variant.tablets_per_strip;
      const stripCount = tabsPerStrip && tabsPerStrip > 0 ? Math.floor(qtyAfter / tabsPerStrip) : 0;
      const totalTablets = tabsPerStrip ? qtyAfter : 0;

      const updatedVariant = await tx.queryOne<any>(
        `
        UPDATE medicine_strength
        SET 
          available_quantity = $1,
          strip_count = $2,
          total_tablets = $3,
          updated_at = NOW()
        WHERE id = $4
        RETURNING *
        `,
        [qtyAfter, stripCount, totalTablets, item.medicineStrengthId]
      );

      const historyRecord = await tx.queryOne<StockHistoryRow>(
        `
        INSERT INTO medicine_stock_history (
          medicine_strength_id,
          transaction_type,
          quantity_change,
          quantity_before,
          quantity_after,
          unit_cost,
          reference_number,
          reason,
          notes,
          performed_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
        RETURNING *
        `,
        [
          item.medicineStrengthId,
          item.transactionType,
          item.quantityDelta,
          qtyBefore,
          qtyAfter,
          item.unitCost ?? null,
          item.referenceNumber?.trim() || null,
          item.reason?.trim() || null,
          item.notes?.trim() || null,
          params.performedBy ?? null,
        ]
      );

      results.push({
        updatedVariant,
        historyRecord: historyRecord!,
      });
    }

    return results;
  });
}

export async function getAllHistory(
  query: QueryAllHistoryInput
): Promise<{ items: StockHistoryRow[]; total: number }> {
  const conditions: string[] = ['1=1'];
  const params: any[] = [];

  if (query.medicine_strength_id) {
    params.push(query.medicine_strength_id);
    conditions.push(`msh.medicine_strength_id = $${params.length}`);
  }

  if (query.transaction_type && query.transaction_type !== 'ALL') {
    if (
      query.transaction_type === 'ALL_REDUCTIONS' ||
      query.transaction_type === 'REDUCTIONS'
    ) {
      conditions.push(`msh.quantity_change < 0`);
    } else {
      params.push(query.transaction_type);
      conditions.push(`msh.transaction_type = $${params.length}`);
    }
  } else if (!query.transaction_type) {
    // Default to reductions only for the dispense / reduce medicine ledger
    conditions.push(`msh.quantity_change < 0`);
  }

  if (query.start_date) {
    params.push(query.start_date);
    conditions.push(`msh.created_at >= $${params.length}`);
  }

  if (query.end_date) {
    params.push(query.end_date);
    conditions.push(`msh.created_at <= $${params.length}`);
  }

  if (query.search?.trim()) {
    params.push(`%${query.search.trim()}%`);
    const sIndex = params.length;
    conditions.push(`(
      m.medicine_name ILIKE $${sIndex} OR
      m.generic_name ILIKE $${sIndex} OR
      msh.reference_number ILIKE $${sIndex} OR
      msh.reason ILIKE $${sIndex} OR
      msh.notes ILIKE $${sIndex} OR
      u.full_name ILIKE $${sIndex}
    )`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM medicine_stock_history msh
    JOIN medicine_strength ms ON msh.medicine_strength_id = ms.id
    JOIN medicines m ON ms.medicine_id = m.id
    LEFT JOIN users u ON msh.performed_by = u.id
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
      msh.*,
      ms.medicine_id,
      m.medicine_name,
      m.generic_name,
      ms.strength,
      ms.strength_unit,
      ms.dosage_form,
      u.full_name AS performer_name,
      u.email AS performer_email
    FROM medicine_stock_history msh
    JOIN medicine_strength ms ON msh.medicine_strength_id = ms.id
    JOIN medicines m ON ms.medicine_id = m.id
    LEFT JOIN users u ON msh.performed_by = u.id
    ${whereClause}
    ORDER BY msh.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: itemsResult.rows,
    total,
  };
}

export async function getSummaryStats(): Promise<InventorySummaryStats> {
  const result = await pool.query(`
    SELECT 
      COUNT(*) AS total_active_variants,
      COUNT(CASE WHEN available_quantity > reorder_level THEN 1 END) AS in_stock_count,
      COUNT(CASE WHEN available_quantity > 0 AND available_quantity <= reorder_level THEN 1 END) AS low_stock_count,
      COUNT(CASE WHEN available_quantity = 0 THEN 1 END) AS out_of_stock_count,
      COALESCE(SUM(available_quantity * COALESCE(purchase_price, final_price, mrp, 0)), 0) AS total_valuation
    FROM medicine_strength
    WHERE status = 'ACTIVE'
  `);

  const row = result.rows[0];
  return {
    total_active_variants: parseInt(row?.total_active_variants ?? '0', 10),
    in_stock_count: parseInt(row?.in_stock_count ?? '0', 10),
    low_stock_count: parseInt(row?.low_stock_count ?? '0', 10),
    out_of_stock_count: parseInt(row?.out_of_stock_count ?? '0', 10),
    total_valuation: parseFloat(row?.total_valuation ?? '0'),
  };
}

export async function getReduceSummaryStats(): Promise<ReduceSummaryStats> {
  const result = await pool.query(`
    SELECT 
      COALESCE(ABS(SUM(CASE WHEN msh.quantity_change < 0 AND msh.created_at >= CURRENT_DATE THEN msh.quantity_change ELSE 0 END)), 0) AS today_tablets_reduced,
      COUNT(CASE WHEN msh.quantity_change < 0 AND msh.created_at >= CURRENT_DATE THEN 1 END) AS today_transactions_count,
      COALESCE(ABS(SUM(CASE WHEN msh.quantity_change < 0 THEN msh.quantity_change ELSE 0 END)), 0) AS total_tablets_reduced,
      COUNT(CASE WHEN msh.quantity_change < 0 THEN 1 END) AS total_transactions_count
    FROM medicine_stock_history msh
  `);

  const inventoryStats = await pool.query(`
    SELECT
      COUNT(CASE WHEN available_quantity > 0 THEN 1 END) AS in_stock_variants,
      COUNT(CASE WHEN available_quantity > 0 AND available_quantity <= reorder_level THEN 1 END) AS low_stock_variants
    FROM medicine_strength
    WHERE status = 'ACTIVE'
  `);

  const row = result.rows[0] || {};
  const invRow = inventoryStats.rows[0] || {};

  return {
    today_tablets_reduced: parseInt(row.today_tablets_reduced ?? '0', 10),
    today_transactions_count: parseInt(row.today_transactions_count ?? '0', 10),
    total_tablets_reduced: parseInt(row.total_tablets_reduced ?? '0', 10),
    total_transactions_count: parseInt(row.total_transactions_count ?? '0', 10),
    in_stock_variants: parseInt(invRow.in_stock_variants ?? '0', 10),
    low_stock_variants: parseInt(invRow.low_stock_variants ?? '0', 10),
  };
}
