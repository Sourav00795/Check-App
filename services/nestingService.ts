import {
  Sheet,
  Part,
  PlacedPart,
  SheetLayout,
  SheetNestingResult,
  LinearPart,
  CutPart,
  StockLayout,
  LinearNestingResult,
  RotationOption,
  Material,
  OptimizationGoal,
} from '../types';

/**
 * Checks if a rectangle (part) can be placed at a given position on a sheet without overlapping other parts.
 */
function canPlace(
  part: { width: number; height: number },
  pos: { x: number; y: number },
  sheet: Sheet,
  placedParts: PlacedPart[],
  partToPartDist: number,
  partToSheetDist: number
): boolean {
  // Check sheet boundaries, including clearance
  if (pos.x < partToSheetDist || pos.y < partToSheetDist) return false;
  if (pos.x + part.width > sheet.length - partToSheetDist) return false;
  if (pos.y + part.height > sheet.width - partToSheetDist) return false;

  // Check for overlap with other placed parts
  for (const other of placedParts) {
    const otherWidth = other.rotated ? other.length : other.width;
    const otherHeight = other.rotated ? other.width : other.length;

    const overlaps =
      pos.x < other.x + otherWidth + partToPartDist &&
      other.x < pos.x + part.width + partToPartDist &&
      pos.y < other.y + otherHeight + partToPartDist &&
      other.y < pos.y + part.height + partToPartDist;

    if (overlaps) {
      return false;
    }
  }
  return true;
}

/**
 * Finds the best position for a part on a sheet.
 * A greedy approach: find the lowest possible y, then the lowest possible x.
 */
// FIX: Export function to be used in other files
export function findBestPosition(
  part: Part,
  sheet: Sheet,
  placedParts: PlacedPart[],
  partToPartDist: number,
  partToSheetDist: number,
  rotation: RotationOption
): { x: number; y: number; rotated: boolean } | null {
  let bestPos: { x: number; y: number; rotated: boolean } | null = null;
  let bestY = Infinity;
  let bestX = Infinity;

  const tryPlacing = (width: number, height: number, rotated: boolean) => {
    // Candidate points: corners of sheet and other parts
    const candidatePoints = [{ x: partToSheetDist, y: partToSheetDist }];
    placedParts.forEach(p => {
      const pWidth = p.rotated ? p.length : p.width;
      const pHeight = p.rotated ? p.width : p.length;
      candidatePoints.push({ x: p.x + pWidth + partToPartDist, y: p.y });
      candidatePoints.push({ x: p.x, y: p.y + pHeight + partToPartDist });
    });

    for (const point of candidatePoints) {
      if (canPlace({ width, height }, point, sheet, placedParts, partToPartDist, partToSheetDist)) {
        if (point.y < bestY || (point.y === bestY && point.x < bestX)) {
          bestY = point.y;
          bestX = point.x;
          bestPos = { ...point, rotated };
        }
      }
    }
  };

  // Try without rotation
  tryPlacing(part.width, part.length, false);

  // Try with rotation if allowed
  if (rotation !== RotationOption.NONE) {
    // try with 90 degree rotation
    tryPlacing(part.length, part.width, true);
  }

  return bestPos;
}

export const performSheetNesting = (
  availableSheets: Sheet[],
  parts: Part[],
  partToPartDist: number,
  partToSheetDist: number,
  rotation: RotationOption,
  material: Material
): SheetNestingResult => {
  const layouts: SheetLayout[] = [];
  let unplacedParts: Part[] = [];
  const totalSheetsUsed: { [key: string]: number } = {};

  // Group parts by grade and thickness
  const partGroups = parts.reduce(
    (acc, part) => {
      const key = `${part.grade}-${part.thickness}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(part);
      return acc;
    },
    {} as { [key: string]: Part[] }
  );

  for (const key in partGroups) {
    const [grade, thicknessStr] = key.split('-');
    const thickness = parseFloat(thicknessStr);
    
    const sheetDefsForGroup = availableSheets.filter(s => s.grade === grade && s.thickness === thickness);

    if (sheetDefsForGroup.length === 0) {
      unplacedParts = [...unplacedParts, ...partGroups[key]];
      continue;
    }
    
    let partsToPlace = partGroups[key]
      .flatMap(p => Array(p.quantity).fill(null).map((_, i) => ({ ...p, id: p.id * 1000 + i, quantity: 1 })))
      .sort((a, b) => b.length * b.width - a.length * a.width); // Sort by area descending

    for(const sheetDef of sheetDefsForGroup){
      if(partsToPlace.length === 0) break;

      const sheetQuantity = sheetDef.quantity;
      let sheetsUsedForThisDef = 0;

      while (partsToPlace.length > 0 && sheetsUsedForThisDef < sheetQuantity) {
        const layout: SheetLayout = {
          sheet: sheetDef,
          sheetIndex: layouts.length + 1,
          placedParts: [],
          usedArea: 0,
          wasteArea: 0,
          wastePercentage: 0,
          usedWeight: 0,
          wasteWeight: 0,
        };

        const remainingParts: Part[] = [];
        let partsPlacedOnThisSheet = 0;

        for (const part of partsToPlace) {
          const position = findBestPosition(part, sheetDef, layout.placedParts, partToPartDist, partToSheetDist, rotation);
          if (position) {
            layout.placedParts.push({ ...part, ...position });
            partsPlacedOnThisSheet++;
          } else {
            remainingParts.push(part);
          }
        }

        if (partsPlacedOnThisSheet === 0) {
          // No parts from the remaining list could be placed on a new sheet of this type.
          // We break to try the next sheet definition.
          break;
        }

        partsToPlace = remainingParts.sort((a, b) => b.length * b.width - a.length * a.width);
        sheetsUsedForThisDef++;

        // Calculate metrics for this layout
        const sheetArea = layout.sheet.length * layout.sheet.width;
        layout.usedArea = layout.placedParts.reduce((acc, p) => acc + p.length * p.width, 0);
        layout.wasteArea = sheetArea - layout.usedArea;
        layout.wastePercentage = sheetArea > 0 ? (layout.wasteArea / sheetArea) * 100 : 0;
        
        const volumeToWeight = (area: number) => (area / 1_000_000) * layout.sheet.thickness * material.density / 1000;
        layout.usedWeight = volumeToWeight(layout.usedArea);
        layout.wasteWeight = volumeToWeight(layout.wasteArea);

        layouts.push(layout);
        const sheetKey = `${sheetDef.length}x${sheetDef.width}x${sheetDef.thickness}-${sheetDef.grade}`;
        totalSheetsUsed[sheetKey] = (totalSheetsUsed[sheetKey] || 0) + 1;
      }
    }
    
    if(partsToPlace.length > 0) {
        unplacedParts.push(...partsToPlace);
    }
  }

  // Consolidate unplaced parts back by originalId and quantity
  const consolidatedUnplaced = unplacedParts.reduce(
    (acc, part) => {
      const existing = acc.find(p => p.originalId === part.originalId);
      if (existing) {
        existing.quantity++;
      } else {
        acc.push({ ...part, quantity: 1 });
      }
      return acc;
    },
    [] as Part[]
  );

  // Calculate total metrics
  const totalSheetArea = layouts.reduce((acc, l) => acc + l.sheet.length * l.sheet.width, 0);
  const totalUsedArea = layouts.reduce((acc, l) => acc + l.usedArea, 0);
  const totalWasteWeight = layouts.reduce((acc, l) => acc + l.wasteWeight, 0);
  const totalUsedWeight = layouts.reduce((acc, l) => acc + l.usedWeight, 0);
  const totalWastePercentage = totalSheetArea > 0 ? ((totalSheetArea - totalUsedArea) / totalSheetArea) * 100 : 0;

  return {
    layouts,
    unplacedParts: consolidatedUnplaced,
    totalSheetsUsed,
    totalUsedWeight,
    totalWasteWeight,
    totalWastePercentage,
    totalUsedArea,
    totalSheetArea,
  };
};

export const performLinearNesting = (
    stockLength: number, 
    parts: LinearPart[],
    optimizationGoal: OptimizationGoal,
    leftEndAllowance: number,
    rightEndAllowance: number
): LinearNestingResult => {
    const usableStockLength = stockLength - leftEndAllowance - rightEndAllowance;
    const allLayouts: StockLayout[] = [];
    const allUnplacedParts: LinearPart[] = [];
    let layoutIndexCounter = 1;

    // Group parts by raw material
    const partGroups = parts.reduce((acc, part) => {
        const key = part.rawMaterial;
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(part);
        return acc;
    }, {} as { [key: string]: LinearPart[] });

    // Perform nesting for each group
    for (const rawMaterial in partGroups) {
        const partsInGroup = partGroups[rawMaterial];
        
        let allCutParts: CutPart[] = [];
        const unplacedForGroup: LinearPart[] = [];

        partsInGroup.forEach(p => {
            if (p.effectiveLength > usableStockLength) {
                unplacedForGroup.push(p);
            } else {
                for (let i = 0; i < p.quantity; i++) {
                    allCutParts.push({ 
                        id: p.id, 
                        length: p.length, 
                        effectiveLength: p.effectiveLength,
                        instanceId: `${p.id}-${i}`,
                        rawMaterial: p.rawMaterial
                    });
                }
            }
        });

        while (allCutParts.length > 0) {
            let bestCutsForThisBar: CutPart[] = [];
            
            const sortedRemaining = [...allCutParts].sort((a,b) => b.effectiveLength - a.effectiveLength);
            const greedyCuts = [];
            let usedLength = 0;
            for (const part of sortedRemaining) {
                if (usedLength + part.effectiveLength <= usableStockLength) {
                    greedyCuts.push(part);
                    usedLength += part.effectiveLength;
                }
            }
            bestCutsForThisBar = greedyCuts;
            let bestWaste = usableStockLength - usedLength;

            if (optimizationGoal === OptimizationGoal.MINIMIZE_WASTE && allCutParts.length > 1) {
                const SHUFFLE_ITERATIONS = 50;
                const tempRemainingParts = [...allCutParts];

                for (let i = 0; i < SHUFFLE_ITERATIONS; i++) {
                    for (let j = tempRemainingParts.length - 1; j > 0; j--) {
                        const k = Math.floor(Math.random() * (j + 1));
                        [tempRemainingParts[j], tempRemainingParts[k]] = [tempRemainingParts[k], tempRemainingParts[j]];
                    }
                    
                    const currentCuts = [];
                    let currentUsed = 0;
                    for (const part of tempRemainingParts) {
                        if (currentUsed + part.effectiveLength <= usableStockLength) {
                            currentCuts.push(part);
                            currentUsed += part.effectiveLength;
                        }
                    }
                    const currentWaste = usableStockLength - currentUsed;
                    
                    if (currentWaste < bestWaste) {
                        bestWaste = currentWaste;
                        bestCutsForThisBar = currentCuts;
                    }
                }
            }
            
            if (bestCutsForThisBar.length === 0) {
                const unplacedMap = new Map<number, { part: LinearPart, count: number }>();
                allCutParts.forEach(rcp => {
                    const original = partsInGroup.find(p => p.id === rcp.id)!;
                     if(unplacedMap.has(original.id)) {
                        unplacedMap.get(original.id)!.count++;
                    } else {
                        unplacedMap.set(original.id, { part: original, count: 1 });
                    }
                });
                unplacedMap.forEach(item => unplacedForGroup.push({ ...item.part, quantity: item.count }));
                break;
            }

            const newLayout: StockLayout = {
                stockIndex: layoutIndexCounter++,
                stockLength: stockLength,
                cuts: bestCutsForThisBar,
                usedLength: bestCutsForThisBar.reduce((sum, c) => sum + c.effectiveLength, 0),
                wasteLength: 0, 
                wastePercentage: 0,
                rawMaterial: rawMaterial,
            };
            allLayouts.push(newLayout);

            const placedInstanceIds = new Set(bestCutsForThisBar.map(p => p.instanceId));
            allCutParts = allCutParts.filter(p => !placedInstanceIds.has(p.instanceId));
        }
        allUnplacedParts.push(...unplacedForGroup);
    }

    // Finalize layout calculations and aggregate totals
    let totalWaste = 0;
    const totalStockLength = allLayouts.length * stockLength;
    allLayouts.forEach(layout => {
        layout.wasteLength = layout.stockLength - layout.usedLength;
        layout.wastePercentage = layout.stockLength > 0 ? (layout.wasteLength / layout.stockLength) * 100 : 0;
        totalWaste += layout.wasteLength;
    });

    const totalWastePercentage = totalStockLength > 0 ? (totalWaste / totalStockLength) * 100 : 0;

    // Consolidate all unplaced parts
    const consolidatedUnplaced = allUnplacedParts.reduce((acc, part) => {
        const existing = acc.find(p => p.id === part.id);
        if (existing) {
            existing.quantity += part.quantity;
        } else {
            acc.push({ ...part });
        }
        return acc;
    }, [] as LinearPart[]);

    return {
        layouts: allLayouts,
        unplacedParts: consolidatedUnplaced,
        totalStockUsed: allLayouts.length,
        totalWaste,
        totalWastePercentage,
    };
};
