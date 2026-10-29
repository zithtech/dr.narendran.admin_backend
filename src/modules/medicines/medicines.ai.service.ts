import { GoogleGenerativeAI } from '@google/generative-ai';

import { env } from '@/config/env.js';

import type { AIMedicineSuggestion } from './medicines.schema.js';

const PRIMARY_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-flash-latest';

const SYSTEM_PROMPT = `
You are an expert clinical pharmacologist and pharmacy database assistant for a Hospital Management System (HMS).
Given a medicine name, brand, salt/generic, or search query (e.g. "Paracetamol", "Amoxicillin", "Metformin", "Pantoprazole"),
generate a list of 3 to 6 accurate, commercially realistic medicine formulations and strengths commonly prescribed and dispensed.

Return STRICT JSON matching this schema:
{
  "medicines": [
    {
      "medicineName": "string (brand/formulation name, e.g. 'Paracetamol 500mg Tablet' or 'Dolo 650mg')",
      "genericName": "string (active chemical/generic ingredient, e.g. 'Paracetamol')",
      "dosageForm": "string (one of: Tablet, Capsule, Syrup, Suspension, Injection, Ointment, Cream, Gel, Drops, Inhaler, Lotion, Powder, Spray, Solution, Suppository)",
      "strength": "string (numeric strength value, e.g. '500', '650', '250', '10')",
      "strengthUnit": "string (one of: mg, g, mcg, ml, IU, %, mg/ml, mg/5ml)",
      "therapeuticCategory": "string (one of: Analgesics / Antipyretic, Antibiotics & Antivirals, Antidiabetic, Cardiovascular & Blood Pressure, Gastrointestinal & Antacids, Respiratory & Allergy, Dermatological, Neurological & Psychiatric, Vitamins, Minerals & Supplements, Ophthalmological / Eye Care, ENT & Oral Care, Orthopedic & Anti-inflammatory, General / Other)",
      "subCategory": "string or null (e.g. 'Pain & Fever Relief', 'Broad-spectrum Antibiotic', 'Proton Pump Inhibitor')",
      "manufacturer": "string or null (e.g. 'Cipla', 'Sun Pharma', 'GSK', 'Abbott', 'Micro Labs')",
      "prescriptionRequired": true or false (boolean, true for Rx drugs/antibiotics, false for common OTC),
      "status": "Active",
      "medicineCode": "string or null",
      "barcode": "string or null",
      "mrp": number or null (realistic standard price in INR, e.g. 25.0),
      "discountType": null,
      "discountValue": null,
      "finalPrice": number or null (equal to mrp),
      "frequency": "string or null (standard dosing frequency, e.g. '1-0-1', '0-0-1', '1-1-1', 'Once Daily', 'TID', 'SOS/As needed')",
      "duration": "string or null (standard course, e.g. '5 days', '3 days', '7 days')",
      "description": "string or null (short, 1-line clinical note on indication and use)"
    }
  ]
}

Important Rules:
1. Ensure medicine names, strengths, and units are accurate and clinically valid.
2. If the user query is generic or brand, provide standard dosage strengths (e.g. for Paracetamol: 500mg, 650mg, 250mg/5ml Syrup).
3. Always return valid JSON with the "medicines" array. If no medicine can be found, return {"medicines": []}.
`;

export async function searchMedicinesWithAi(query: string): Promise<AIMedicineSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const apiKey = env.GEMINI_API_KEY || process.env['GEMINI_API_KEY'] || process.env['AI_API_KEY'];
  if (!apiKey) {
    throw new Error('AI service is not configured. Missing GEMINI_API_KEY.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const executePrompt = async (modelName: string): Promise<string> => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
    });

    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: `Search and retrieve clinical formulations for: "${trimmed}"` }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    return response.response.text();
  };

  let rawText = '';
  try {
    rawText = await executePrompt(PRIMARY_MODEL);
  } catch (primaryErr: unknown) {
    console.warn(`[AI Service] Failed with primary model ${PRIMARY_MODEL}, trying fallback:`, primaryErr);
    try {
      rawText = await executePrompt(FALLBACK_MODEL);
    } catch (fallbackErr: unknown) {
      console.error('[AI Service] All AI models failed:', fallbackErr);
      throw new Error('AI service unavailable. Please try again later.');
    }
  }

  try {
    // Clean any markdown fences if present
    const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned) as { medicines?: AIMedicineSuggestion[] };

    if (!parsed || !Array.isArray(parsed.medicines)) {
      return [];
    }

    return parsed.medicines.map((m): AIMedicineSuggestion => ({
      medicineName: String(m.medicineName || '').trim(),
      genericName: m.genericName ? String(m.genericName).trim() : null,
      dosageForm: m.dosageForm ? String(m.dosageForm).trim() : 'Tablet',
      strength: m.strength !== null && m.strength !== undefined ? String(m.strength).trim() : null,
      strengthUnit: m.strengthUnit ? String(m.strengthUnit).trim() : 'mg',
      therapeuticCategory: m.therapeuticCategory ? String(m.therapeuticCategory).trim() : null,
      subCategory: m.subCategory ? String(m.subCategory).trim() : null,
      manufacturer: m.manufacturer ? String(m.manufacturer).trim() : null,
      prescriptionRequired: Boolean(m.prescriptionRequired),
      status: 'Active' as const,
      medicineCode: m.medicineCode ? String(m.medicineCode).trim() : null,
      barcode: m.barcode ? String(m.barcode).trim() : null,
      mrp: typeof m.mrp === 'number' && !isNaN(m.mrp) ? m.mrp : null,
      discountType: m.discountType === 'Percentage' || m.discountType === 'Fixed Amount' ? m.discountType : null,
      discountValue: typeof m.discountValue === 'number' && !isNaN(m.discountValue) ? m.discountValue : null,
      finalPrice: typeof m.finalPrice === 'number' && !isNaN(m.finalPrice) ? m.finalPrice : (typeof m.mrp === 'number' ? m.mrp : null),
      frequency: m.frequency ? String(m.frequency).trim() : null,
      duration: m.duration ? String(m.duration).trim() : null,
      description: m.description ? String(m.description).trim() : null,
    })).filter((m) => m.medicineName.length > 0);
  } catch (parseErr: unknown) {
    console.error('[AI Service] Failed to parse AI JSON response:', parseErr, rawText);
    return [];
  }
}
