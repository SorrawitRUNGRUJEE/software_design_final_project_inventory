import {
  IsString,
  IsNumber,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
} from 'class-validator';

// ============================================================
// Row 2 — Inspection (4 categories, each pass/fail)
// POST /api/v1/properties/:id/examination
// ============================================================
export class ExaminationDto {
  @IsBoolean()
  structurePassed: boolean;

  @IsBoolean()
  waterAndRoofPassed: boolean;

  @IsBoolean()
  electricityPassed: boolean;

  @IsBoolean()
  generalConditionPassed: boolean;

  @IsString()
  @IsNotEmpty()
  inspectedBy: string;

  @IsString()
  @IsOptional()
  remarks?: string;
}

// ============================================================
// Row 4 — Property Details (registered into system)
// POST /api/v1/properties
// Matches the FE form: Basic Identification, Sale Preparation,
// Current Inventory Details
// ============================================================
export class CreatePropertyDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  // --- Basic Identification ---
  @IsString()
  @IsNotEmpty()
  propertyName: string;

  @IsString()
  @IsOptional()
  unitNumber?: string;

  @IsString()
  @IsNotEmpty()
  fullAddress: string;

  @IsString()
  @IsNotEmpty()
  propertyType: string;

  // --- Sale Preparation ---
  @IsNumber()
  originalPurchasePrice: number;

  @IsNumber()
  targetSellingPrice: number;

  @IsString()
  @IsNotEmpty()
  propertyCondition: string;

  // --- Current Inventory Details ---
  @IsNumber()
  totalSquareFootage: number;

  @IsNumber()
  roomCount: number;

  @IsString()
  @IsNotEmpty()
  registeredBy: string;
}

// ============================================================
// Row 5 — Price Negotiation (price has been settled)
// PUT /api/v1/properties/:id/price
// ============================================================
export class SettlePriceDto {
  @IsNumber()
  agreedPrice: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsNotEmpty()
  settledBy: string;
}

// ============================================================
// Row 6 — Finalize & Submit (saved into system)
// POST /api/v1/properties/:id/finalize
// No new data needed — just confirmation
// ============================================================
export class FinalizePropertyDto {
  @IsString()
  @IsNotEmpty()
  confirmedBy: string;
}

// ============================================================
// Defect Report (Flow 4)
// POST /api/v1/defects
// ============================================================
export class DefectReportDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @IsString()
  @IsNotEmpty()
  customerId: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  category?: string;
}
