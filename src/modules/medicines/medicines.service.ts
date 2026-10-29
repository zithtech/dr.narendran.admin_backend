import { NotFoundError } from '@/http/errors.js';

import * as repository from './medicines.repository.js';
import type {
  BulkImportInput,
  CreateMedicineInput,
  ListMedicinesQuery,
  UpdateMedicineInput,
  CreatePackageInput,
  UpdatePackageInput,
} from './medicines.schema.js';

export async function createMedicine(input: CreateMedicineInput) {
  return repository.createMedicine(input);
}

export async function updateMedicine(id: string, input: UpdateMedicineInput) {
  const existing = await repository.getMedicineById(id);
  if (!existing) throw new NotFoundError('Medicine not found');

  return repository.updateMedicine(id, input);
}

export async function getMedicineById(id: string) {
  const existing = await repository.getMedicineById(id);
  if (!existing) throw new NotFoundError('Medicine not found');

  return existing;
}

export async function listMedicines(query: ListMedicinesQuery) {
  return repository.listMedicines(query);
}

export async function softDeleteMedicine(id: string) {
  const existing = await repository.getMedicineById(id);
  if (!existing) throw new NotFoundError('Medicine not found');

  return repository.softDeleteMedicine(id);
}

export async function bulkValidateMedicines(rawMedicines: any[]) {
  return repository.bulkValidateMedicines(rawMedicines);
}

export async function bulkImportMedicines(input: BulkImportInput) {
  return repository.bulkImportMedicines(input);
}


export async function listPackages(doctorId: string) {
  return repository.listPackages(doctorId);
}

export async function createPackage(doctorId: string, input: CreatePackageInput) {
  return repository.createPackage(doctorId, input);
}

export async function updatePackage(id: string, doctorId: string, input: UpdatePackageInput) {
  return repository.updatePackage(id, doctorId, input);
}

export async function deletePackage(id: string, doctorId: string) {
  return repository.deletePackage(id, doctorId);
}

