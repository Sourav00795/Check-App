import { Unit, Part, LinearPart } from '../types';

export const convertToBaseUnit = (value: number, fromUnit: Unit): number => {
  switch (fromUnit) {
    case Unit.MM:
      return value;
    case Unit.CM:
      return value * 10;
    case Unit.M:
      return value * 1000;
    case Unit.INCH:
      return value * 25.4;
    default:
      return value;
  }
};

export const convertFromBaseUnit = (value: number, toUnit: Unit): number => {
  switch (toUnit) {
    case Unit.MM:
      return value;
    case Unit.CM:
      return value / 10;
    case Unit.M:
      return value / 1000;
    case Unit.INCH:
      return value / 25.4;
    default:
      return value;
  }
};

export const parseSheetPartsFromColumns = (
    namesStr: string,
    lengthsStr: string,
    widthsStr: string,
    thicknessesStr: string,
    gradesStr: string,
    quantitiesStr: string
): { parts: Part[]; errors: string[] } => {
    const parts: Part[] = [];
    const errors: string[] = [];

    const names = namesStr.split('\n').map(s => s.trim());
    const lengths = lengthsStr.split('\n').map(s => s.trim());
    const widths = widthsStr.split('\n').map(s => s.trim());
    const thicknesses = thicknessesStr.split('\n').map(s => s.trim());
    const grades = gradesStr.split('\n').map(s => s.trim());
    const quantities = quantitiesStr.split('\n').map(s => s.trim());

    const lineCount = Math.max(names.length, lengths.length, widths.length, thicknesses.length, grades.length, quantities.length);
    if(lineCount === 1 && names[0] === '' && lengths[0] === '' && widths[0] === '' && thicknesses[0] === '' && grades[0] === '' && quantities[0] === '') {
        return { parts: [], errors: [] }; // Handle empty input
    }
    
    for (let i = 0; i < lineCount; i++) {
        const lineNum = i + 1;
        const name = names[i] || '';
        const lengthStr = lengths[i] || '';
        const widthStr = widths[i] || '';
        const thicknessStr = thicknesses[i] || '';
        const grade = grades[i] || '';
        const quantityStr = quantities[i] || '';

        // Skip empty lines
        if (!name && !lengthStr && !widthStr && !thicknessStr && !grade && !quantityStr) continue;

        const length = parseFloat(lengthStr);
        const width = parseFloat(widthStr);
        const thickness = parseFloat(thicknessStr);
        const quantity = parseInt(quantityStr, 10);

        if (!name || isNaN(length) || isNaN(width) || isNaN(thickness) || !grade || isNaN(quantity)) {
            errors.push(`Error on line ${lineNum}: One or more fields have an invalid format or are missing.`);
            continue;
        }
        
        // If quantity is exactly 0, it's a valid way to ignore a part, so skip it without error.
        if (quantity === 0) {
            continue;
        }

        if (length <= 0 || width <= 0 || thickness <= 0) {
            errors.push(`Error on line ${lineNum}: Dimensions must be positive numbers.`);
            continue;
        }

        // We've already handled quantity === 0, so this check is for negative quantities.
        if (quantity < 0) {
             errors.push(`Error on line ${lineNum}: Quantity must be a positive number.`);
            continue;
        }

        parts.push({
            id: lineNum,
            originalId: lineNum,
            name,
            length,
            width,
            thickness,
            grade,
            quantity
        });
    }

    return { parts, errors };
};


export const parseLinearParts = (
  csvData: string,
  allowance: number
): { parts: LinearPart[]; errors: string[] } => {
  const lines = csvData.split('\n').map(s => s.trim()).filter(Boolean);
  const parts: LinearPart[] = [];
  const errors: string[] = [];

  lines.forEach((line, i) => {
    const fields = line.split(',').map(f => f.trim());
    if (fields.length !== 3) {
      errors.push(`Error on line ${i + 1}: Expected 3 fields (raw material, length, quantity), but found ${fields.length}.`);
      return;
    }
    
    const [rawMaterial, lengthStr, quantityStr] = fields;
    const length = parseFloat(lengthStr);
    const quantity = parseInt(quantityStr, 10);

    if (!rawMaterial) {
      errors.push(`Error on line ${i + 1}: Raw material is missing.`);
      return;
    }

    if (isNaN(length) || isNaN(quantity)) {
      errors.push(`Error on line ${i + 1}: Invalid number format for length or quantity.`);
      return;
    }
     if (length <= 0 || quantity < 0) {
      errors.push(`Error on line ${i + 1}: Length must be positive and quantity non-negative.`);
      return;
    }

    if (quantity > 0) {
      parts.push({ id: i, rawMaterial, length, quantity, effectiveLength: length + allowance });
    }
  });
  return { parts, errors };
};