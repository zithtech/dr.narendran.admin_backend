 
import { query, queryOne } from '@/db/query.js';

import type { CreateLabTestInput, ListLabTestsQuery,UpdateLabTestInput } from './labTests.schema.js';

export async function createLabTest(input: CreateLabTestInput) {
  const sql = `
    INSERT INTO lab_tests (
      name, test_type, description, price, status
    ) VALUES (
      $1, $2, $3, $4, $5
    ) RETURNING *;
  `;
  const values = [
    input.name, input.testType, input.description || null, input.price || null, input.status
  ];
  return queryOne(sql, values);
}

export async function updateLabTest(id: string, input: UpdateLabTestInput) {
  const fields: string[] = [];
  const values: any[] = [];
  let index = 1;

  for (const [key, value] of Object.entries(input)) {
    const column = key === 'testType' ? 'test_type' : key;
    fields.push('"' + column + '" = $' + index);
    values.push(value);
    index++;
  }

  fields.push(`updated_at = current_timestamp`);
  values.push(id);

  const sql = `
    UPDATE lab_tests SET ${fields.join(', ')}
    WHERE id = $${index}
    RETURNING *;
  `;
  return queryOne(sql, values);
}

export async function getLabTestById(id: string) {
  return queryOne('SELECT * FROM lab_tests WHERE id = $1', [id]);
}

export async function listLabTests(params: ListLabTestsQuery) {
  let sql = 'SELECT * FROM lab_tests WHERE 1=1';
  const values: any[] = [];
  let index = 1;

  if (params.search) {
    sql += ` AND (name ILIKE $${index} OR description ILIKE $${index})`;
    values.push(`%${params.search}%`);
    index++;
  }

  if (params.testType) {
    sql += ` AND test_type = $${index}`;
    values.push(params.testType);
    index++;
  }

  if (params.status) {
    sql += ` AND status = $${index}`;
    values.push(params.status);
    index++;
  }

  sql += ` ORDER BY name ASC LIMIT $${index} OFFSET $${index + 1}`;
  
  // Clone values for count query before adding limit/offset
  const countValues = [...values];
  values.push(params.limit, params.offset);

  const rows = await query(sql, values);
  
  let countSql = 'SELECT COUNT(*) FROM lab_tests WHERE 1=1';
   
    let countIndex = 1;

  if (params.search) {
    countSql += ` AND (name ILIKE $${countIndex} OR description ILIKE $${countIndex})`;
    countIndex++;
  }
  if (params.testType) {
    countSql += ` AND test_type = $${countIndex}`;
    countIndex++;
  }
  if (params.status) {
    countSql += ` AND status = $${countIndex}`;
  }
  
  const countRes = await queryOne<{count: string}>(countSql, countValues);
  const total = parseInt(countRes?.count || '0', 10);

  return { labTests: rows, total };
}

export async function softDeleteLabTest(id: string) {
  return queryOne(
    "UPDATE lab_tests SET status = 'Inactive', updated_at = current_timestamp WHERE id = $1 RETURNING *",
    [id]
  );
}
