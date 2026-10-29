import type { Request, Response } from 'express';

import type { CreateLabTestInput, ListLabTestsQuery,UpdateLabTestInput } from './labTests.schema.js';
import * as service from './labTests.service.js';

export async function createLabTest(input: { body: CreateLabTestInput }, req: Request, res: Response) {
  const labTest = await service.createLabTest(input.body);
  res.status(201).json(labTest);
}

export async function updateLabTest(input: { params: { id: string }, body: UpdateLabTestInput }, req: Request, res: Response) {
  const labTest = await service.updateLabTest(input.params.id, input.body);
  res.status(200).json(labTest);
}

export async function getLabTestById(input: { params: { id: string } }, req: Request, res: Response) {
  const labTest = await service.getLabTestById(input.params.id);
  res.status(200).json(labTest);
}

export async function listLabTests(input: { query: ListLabTestsQuery }, req: Request, res: Response) {
  const result = await service.listLabTests(input.query);
  res.status(200).json(result);
}

export async function deleteLabTest(input: { params: { id: string } }, req: Request, res: Response) {
  const labTest = await service.softDeleteLabTest(input.params.id);
  res.status(200).json(labTest);
}
