export enum Unit {
  MM = 'mm',
  CM = 'cm',
  M = 'm',
  INCH = 'inch',
}

export interface Material {
  name: string;
  density: number; // kg/m^3
}

// --- Sheet Metal Types ---

export interface Sheet {
  id: string;
  length: number;
  width: number;
  thickness: number;
  grade: string;
  quantity: number;
  isExpanded: boolean;
}

export interface Part {
  id: number;
  name: string;
  length: number;
  width: number;
  thickness: number;
  grade: string;
  quantity: number;
  originalId: number;
}

export interface PlacedPart extends Part {
  x: number;
  y: number;
  rotated: boolean;
}

export interface SheetLayout {
  sheet: Sheet;
  sheetIndex: number;
  placedParts: PlacedPart[];
  usedArea: number;
  wasteArea: number;
  wastePercentage: number;
  usedWeight: number;
  wasteWeight: number;
}

export interface SheetNestingResult {
  layouts: SheetLayout[];
  unplacedParts: Part[];
  totalSheetsUsed: { [key: string]: number };
  totalUsedWeight: number;
  totalWasteWeight: number;
  totalWastePercentage: number;
  totalUsedArea: number;
  totalSheetArea: number;
}

// --- Linear Nesting Types ---

export interface Stock {
  length: number;
  description: string;
}

export interface LinearPart {
  id: number;
  length: number;
  quantity: number;
  effectiveLength: number;
  rawMaterial: string;
}

export interface CutPart {
  id: number;
  length: number;
  effectiveLength: number;
  instanceId: string;
  rawMaterial: string;
}

export interface StockLayout {
  stockIndex: number;
  stockLength: number;
  cuts: CutPart[];
  usedLength: number;
  wasteLength: number;
  wastePercentage: number;
  rawMaterial: string;
}

export interface LinearNestingResult {
  layouts: StockLayout[];
  unplacedParts: LinearPart[];
  totalStockUsed: number;
  totalWaste: number;
  totalWastePercentage: number;
}

export enum Page {
    Home,
    SheetMetal,
    LinearNesting,
}

export enum RotationOption {
    NONE = 'None',
    NINETY = '90° Only',
    FREE = 'Free',
}

export enum OptimizationGoal {
    PRIORITIZE_SPEED = 'Prioritize Speed',
    MINIMIZE_WASTE = 'Minimize Waste',
}

// --- Output Data Types ---

export interface OutputDataRow {
  id: string;
  type: 'linear' | 'sheet';
  description: string;
  lengthMtr: string;
  weightKg: string;
  remarks: string;
}

export interface OutputRules {
  utilizationThreshold: number;
  linearUtilizationThreshold: number;
  mixedUtilizationMultiplier: number;
  plateMultiplier: number;
}