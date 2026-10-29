import type { Request, Response } from 'express';
import { NotFoundError } from '@/http/errors.js';
import { doctorsService } from '../doctors/doctors.service.js';

import * as aiService from './medicines.ai.service.js';
import type {
  AiSearchMedicineInput,
  BulkImportInput,
  BulkValidateInput,
  CreateMedicineInput,
  ListMedicinesQuery,
  UpdateMedicineInput,
  CreatePackageInput,
  UpdatePackageInput,
} from './medicines.schema.js';
import * as service from './medicines.service.js';

export async function createMedicine(
  input: { body: CreateMedicineInput },
  _req: Request,
  res: Response
) {
  const medicine = await service.createMedicine(input.body);
  res.status(201).json(medicine);
}

export async function updateMedicine(
  input: { params: { id: string }; body: UpdateMedicineInput },
  _req: Request,
  res: Response
) {
  const medicine = await service.updateMedicine(input.params.id, input.body);
  res.status(200).json(medicine);
}

export async function getMedicineById(
  input: { params: { id: string } },
  _req: Request,
  res: Response
) {
  const medicine = await service.getMedicineById(input.params.id);
  res.status(200).json(medicine);
}

export async function listMedicines(
  input: { query: ListMedicinesQuery },
  _req: Request,
  res: Response
) {
  const result = await service.listMedicines(input.query);
  res.status(200).json(result);
}

export async function deleteMedicine(
  input: { params: { id: string } },
  _req: Request,
  res: Response
) {
  const medicine = await service.softDeleteMedicine(input.params.id);
  res.status(200).json(medicine);
}

export async function bulkValidate(
  input: { body: BulkValidateInput },
  _req: Request,
  res: Response
) {
  const result = await service.bulkValidateMedicines(input.body.medicines);
  res.status(200).json(result);
}

export async function bulkImport(
  input: { body: BulkImportInput },
  _req: Request,
  res: Response
) {
  const result = await service.bulkImportMedicines(input.body);
  res.status(200).json(result);
}

export async function aiSearchMedicines(
  input: { body: AiSearchMedicineInput },
  _req: Request,
  res: Response
) {
  const medicines = await aiService.searchMedicinesWithAi(input.body.query);
  res.status(200).json({ medicines });
}

export async function listPackages(
  _req: Request,
  res: Response
) {
  const doctor = await doctorsService.getDoctorById(_req.user!.id);
  if (!doctor) throw new NotFoundError('Doctor not found for the current user');
  
  const packages = await service.listPackages(doctor.id);
  res.status(200).json(packages);
}

export async function createPackage(
  input: { body: CreatePackageInput },
  _req: Request,
  res: Response
) {
  const doctor = await doctorsService.getDoctorById(_req.user!.id);
  if (!doctor) throw new NotFoundError('Doctor not found for the current user');
  
  const pkg = await service.createPackage(doctor.id, input.body);
  res.status(201).json(pkg);
}

export async function updatePackage(
  input: { params: { id: string }; body: UpdatePackageInput },
  _req: Request,
  res: Response
) {
  const doctor = await doctorsService.getDoctorById(_req.user!.id);
  if (!doctor) throw new NotFoundError('Doctor not found for the current user');
  
  const pkg = await service.updatePackage(input.params.id, doctor.id, input.body);
  res.status(200).json(pkg);
}

export async function deletePackage(
  input: { params: { id: string } },
  _req: Request,
  res: Response
) {
  const doctor = await doctorsService.getDoctorById(_req.user!.id);
  if (!doctor) throw new NotFoundError('Doctor not found for the current user');
  
  await service.deletePackage(input.params.id, doctor.id);
  res.status(204).send();
}
