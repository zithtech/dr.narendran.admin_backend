import { NotFoundError } from '@/http/errors.js';

import * as repository from './labTests.repository.js';
import type { CreateLabTestInput, ListLabTestsQuery,UpdateLabTestInput } from './labTests.schema.js';

export async function createLabTest(input: CreateLabTestInput) {
  return repository.createLabTest(input);
}

export async function updateLabTest(id: string, input: UpdateLabTestInput) {
  const existing = await repository.getLabTestById(id);
  if (!existing) throw new NotFoundError('Lab test not found');
  
  return repository.updateLabTest(id, input);
}

export async function getLabTestById(id: string) {
  const existing = await repository.getLabTestById(id);
  if (!existing) throw new NotFoundError('Lab test not found');
  
  return existing;
}

export async function listLabTests(query: ListLabTestsQuery) {
  return repository.listLabTests(query);
}

export async function softDeleteLabTest(id: string) {
  const existing = await repository.getLabTestById(id);
  if (!existing) throw new NotFoundError('Lab test not found');
  
  return repository.softDeleteLabTest(id);
}
