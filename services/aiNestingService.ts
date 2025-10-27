import { GoogleGenAI, Type } from '@google/genai';
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
} from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = 'gemini-2.5-flash';

export const getMaterialDensity = async (materialGrade: string): Promise<{ density: number | null; sources: any[] | undefined }> => {
    // Basic check for common materials to avoid unnecessary API calls
    if (materialGrade.toUpperCase().includes('MS') || materialGrade.toUpperCase().includes('MILD STEEL')) return { density: 7850, sources: [] };
    if (materialGrade.toUpperCase().includes('SS') || materialGrade.toUpperCase().includes('STAINLESS')) return { density: 8000, sources: [] };
    if (materialGrade.toUpperCase().includes('AL') || materialGrade.toUpperCase().includes('ALUMINIUM')) return { density: 2700, sources: [] };

    const prompt = `What is the density of "${materialGrade}" in kilograms per cubic meter (kg/m^3)? Provide only the numerical value. For example, if the density is 7850 kg/m^3, respond with "7850". If you can't find the exact grade, provide the density for the closest standard equivalent.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            }
        });

        const text = response.text.trim();
        const density = parseFloat(text.replace(/,/g, ''));
        const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks;

        if (!isNaN(density) && density > 0) {
            return { density, sources };
        }
        
        console.warn(`Could not parse density from AI response for ${materialGrade}: "${text}"`);
        return { density: null, sources };
    } catch (error) {
        console.error(`Error fetching material density for ${materialGrade}:`, error);
        return { density: null, sources: undefined };
    }
};


const sheetNestingResponseSchema = {
    type: Type.OBJECT,
    properties: {
        layouts: {
            type: Type.ARRAY,
            description: 'An array of sheet layouts. Create a new sheet only when a part cannot fit on any existing sheets.',
            items: {
                type: Type.OBJECT,
                properties: {
                    placedParts: {
                        type: Type.ARRAY,
                        description: 'List of parts placed on this sheet.',
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                originalId: { type: Type.NUMBER, description: 'The original ID of the part.' },
                                x: { type: Type.NUMBER, description: 'The x-coordinate of the top-left corner.' },
                                y: { type: Type.NUMBER, description: 'The y-coordinate of the top-left corner.' },
                                rotated: { type: Type.BOOLEAN, description: 'True if the part is rotated by 90 degrees.' },
                            },
                            required: ['originalId', 'x', 'y', 'rotated']
                        }
                    }
                },
                required: ['placedParts']
            }
        },
        unplacedParts: {
            type: Type.ARRAY,
            description: 'List of parts that could not be placed on any sheet.',
            items: {
                type: Type.OBJECT,
                properties: {
                    originalId: { type: Type.NUMBER, description: 'The original ID of the part that could not be placed.' },
                    quantity: { type: Type.NUMBER, description: 'The quantity of this part that could not be placed.' },
                },
                required: ['originalId', 'quantity']
            }
        }
    },
    required: ['layouts', 'unplacedParts']
};

interface SheetNestingAIResponse {
    layouts: {
        placedParts: {
            originalId: number;
            x: number;
            y: number;
            rotated: boolean;
        }[];
    }[];
    unplacedParts: {
        originalId: number;
        quantity: number;
    }[];
}

export const performSheetNestingWithAI = async (
  availableSheets: Sheet[],
  parts: Part[],
  partToPartDist: number,
  partToSheetDist: number,
  rotation: RotationOption,
  material: Material
): Promise<SheetNestingResult> => {
    let remainingPartsToNest = [...parts];
    const allLayouts: SheetLayout[] = [];

    for (const sheetDef of availableSheets) {
        if (remainingPartsToNest.length === 0) break;

        // Create a prompt only with parts that can potentially fit on the current sheet definition
        const partsForThisRun = remainingPartsToNest.filter(p =>
            (p.length + 2 * partToSheetDist <= sheetDef.length && p.width + 2 * partToSheetDist <= sheetDef.width) ||
            (rotation !== RotationOption.NONE && p.width + 2 * partToSheetDist <= sheetDef.length && p.length + 2 * partToSheetDist <= sheetDef.width)
        );

        if (partsForThisRun.length === 0) continue;

        const partsForPrompt = partsForThisRun.map(p => ({
            partName: p.name,
            originalId: p.originalId,
            length: p.length,
            width: p.width,
            quantity: p.quantity,
        }));

        const prompt = `You are an expert in 2D nesting optimization. Your task is to efficiently place a list of rectangular parts onto identical rectangular sheets to minimize the number of sheets used and the total waste area.

**Constraints:**
1.  **Sheet Boundaries:** All parts must be placed entirely within the sheet dimensions: length=${sheetDef.length}, width=${sheetDef.width}. Coordinates are from the top-left corner (0,0).
2.  **Edge Clearance:** A minimum distance of ${partToSheetDist} must be maintained between any part and the edge of the sheet.
3.  **Part Clearance:** A minimum distance of ${partToPartDist} must be maintained between any two parts.
4.  **No Overlap:** Parts cannot overlap.
5.  **Rotation:** Parts ${rotation === RotationOption.NONE ? 'cannot be rotated.' : 'can be rotated by 90 degrees.'}

**Objectives:**
1.  **Primary Goal:** Place as many of the given parts as possible onto identical sheets of the specified size. Use the minimum number of sheets. Start by filling the first sheet completely before using a new one. Prioritize placing larger parts first.
2.  **Secondary Goal:** When multiple placement options have similar material utilization, prefer layouts that align parts horizontally. This creates larger, more usable rectangular offcuts and reduces scrap. For example, if a part can be placed vertically or horizontally with little difference in overall waste, choose the horizontal orientation.

**Input Parts:**
${JSON.stringify(partsForPrompt)}

**Output Format:**
You must provide your response in a JSON object that strictly adheres to the provided schema. The 'unplacedParts' list should only contain parts from the input list that you could not place.`;

        try {
            const response = await ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: sheetNestingResponseSchema
                }
            });

            const aiResult: SheetNestingAIResponse = JSON.parse(response.text);

            if (aiResult.layouts && aiResult.layouts.length > 0) {
                const layoutsFromRun: SheetLayout[] = aiResult.layouts.map((aiLayout) => {
                    const placedParts: PlacedPart[] = aiLayout.placedParts.map((p) => {
                        const partInfo = parts.find(part => part.originalId === p.originalId);
                        if (!partInfo) {
                            return null;
                        }
                        return {
                            ...partInfo,
                            quantity: 1,
                            id: (partInfo.id * 1000) + Math.random(),
                            originalId: p.originalId,
                            x: p.x,
                            y: p.y,
                            rotated: p.rotated,
                        };
                    }).filter((p): p is PlacedPart => p !== null);

                    const sheetArea = sheetDef.length * sheetDef.width;
                    const usedArea = placedParts.reduce((acc, p) => acc + p.length * p.width, 0);
                    const wasteArea = sheetArea - usedArea;
                    const wastePercentage = sheetArea > 0 ? (wasteArea / sheetArea) * 100 : 0;
                    const volumeToWeight = (area: number) => (area / 1_000_000) * sheetDef.thickness * material.density / 1000;
                    const usedWeight = volumeToWeight(usedArea);
                    const wasteWeight = volumeToWeight(wasteArea);

                    return {
                        sheet: sheetDef,
                        sheetIndex: 0, // Will be re-indexed later
                        placedParts,
                        usedArea,
                        wasteArea,
                        wastePercentage,
                        usedWeight,
                        wasteWeight,
                    };
                });
                allLayouts.push(...layoutsFromRun);
            }

            // The AI tells us which parts (and quantities) are left from the ones we sent it.
            // We need to combine these with the parts that were never sent to the AI in this run.
            const unplacedFromAi = new Map(
                aiResult.unplacedParts.map((p) => [p.originalId, p.quantity])
            );

            const nextRemainingParts: Part[] = [];

            // Add back parts that were never sent to the AI for this sheet type.
            const partsNotAttempted = remainingPartsToNest.filter(p => !partsForThisRun.some(pfts => pfts.originalId === p.originalId));
            nextRemainingParts.push(...partsNotAttempted);
            
            // Add back parts that were sent but returned as unplaced.
            for (const part of partsForThisRun) {
                if (unplacedFromAi.has(part.originalId)) {
                    const unplacedQty = unplacedFromAi.get(part.originalId)!;
                    if (unplacedQty > 0) {
                        nextRemainingParts.push({ ...part, quantity: unplacedQty });
                    }
                }
            }
            remainingPartsToNest = nextRemainingParts;

        } catch (error) {
            console.error(`AI Sheet Nesting Error for sheet type ${sheetDef.id}:`, error);
            // If AI fails for this sheet, assume no parts were placed and continue to the next sheet type.
        }
    }

    // Final consolidation of results
    const totalSheetsUsed: { [key: string]: number } = {};
    allLayouts.forEach(layout => {
        const key = `${layout.sheet.length}x${layout.sheet.width}x${layout.sheet.thickness}-${layout.sheet.grade}`;
        totalSheetsUsed[key] = (totalSheetsUsed[key] || 0) + 1;
    });

    const totalSheetArea = allLayouts.reduce((acc, l) => acc + l.sheet.length * l.sheet.width, 0);
    const totalUsedArea = allLayouts.reduce((acc, l) => acc + l.usedArea, 0);
    const totalWasteWeight = allLayouts.reduce((acc, l) => acc + l.wasteWeight, 0);
    const totalUsedWeight = allLayouts.reduce((acc, l) => acc + l.usedWeight, 0);
    const totalWastePercentage = totalSheetArea > 0 ? ((totalSheetArea - totalUsedArea) / totalSheetArea) * 100 : 0;

    return {
        layouts: allLayouts.map((l, i) => ({ ...l, sheetIndex: i + 1 })),
        unplacedParts: remainingPartsToNest,
        totalSheetsUsed,
        totalUsedWeight,
        totalWasteWeight,
        totalWastePercentage,
        totalUsedArea,
        totalSheetArea,
    };
};


const linearNestingResponseSchema = {
    type: Type.OBJECT,
    properties: {
        layouts: {
            type: Type.ARRAY,
            description: 'An array of stock bar layouts. Each represents one bar cut.',
            items: {
                type: Type.OBJECT,
                properties: {
                    cuts: {
                        type: Type.ARRAY,
                        description: 'List of part lengths cut from this stock bar.',
                        items: { type: Type.NUMBER, description: 'The length of the cut part.' }
                    }
                },
                required: ['cuts']
            }
        },
        unplacedParts: {
            type: Type.ARRAY,
            description: 'List of part lengths that could not be cut.',
            items: {
                type: Type.OBJECT,
                properties: {
                    length: { type: Type.NUMBER },
                    quantity: { type: Type.NUMBER }
                },
                required: ['length', 'quantity']
            }
        }
    },
    required: ['layouts', 'unplacedParts']
};

interface LinearNestingAIResponse {
    layouts: {
        cuts: number[];
    }[];
    unplacedParts: {
        length: number;
        quantity: number;
    }[];
}

export const performLinearNestingWithAI = async (stockLength: number, parts: LinearPart[]): Promise<LinearNestingResult> => {

    const partsForPrompt = parts.map(p => ({ length: p.length, quantity: p.quantity, effectiveLength: p.effectiveLength }));

    const prompt = `You are an expert in 1D cutting stock optimization. Your goal is to cut a list of required part lengths from standard stock bars to minimize waste.

**Stock Length:** ${stockLength}
**Parts List (length, quantity, length+allowance):**
${JSON.stringify(partsForPrompt)}

**Objective:**
Cut all the required parts using the minimum number of stock bars. For each bar, list the effective lengths of the parts you cut from it.

**Output Format:**
You must provide your response in a JSON object that strictly adheres to the provided schema. The output should contain a list of layouts (one for each stock bar used) and a list of any parts that could not be placed.
`;

    try {
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: linearNestingResponseSchema,
            },
        });
        
        const aiResult: LinearNestingAIResponse = JSON.parse(response.text);
        
        const partInstanceCounters = new Map<number, number>(); // part id -> count of instances made
        const layouts: StockLayout[] = aiResult.layouts.map((aiLayout, index) => {
            const cuts: CutPart[] = (aiLayout.cuts || []).map((cutLength) => {
                const originalPart = parts.find(p => p.effectiveLength === cutLength);
                const partId = originalPart?.id ?? -1;

                const instanceIndex = partInstanceCounters.get(partId) || 0;
                partInstanceCounters.set(partId, instanceIndex + 1);

                return {
                    id: partId,
                    length: originalPart?.length ?? cutLength,
                    effectiveLength: cutLength,
                    instanceId: `${partId}-${instanceIndex}`,
                    rawMaterial: originalPart?.rawMaterial ?? 'unknown',
                };
            });

            const usedLength = cuts.reduce((sum, cut) => sum + cut.effectiveLength, 0);
            const wasteLength = stockLength - usedLength;
            const wastePercentage = stockLength > 0 ? (wasteLength / stockLength) * 100 : 0;

            return {
                stockIndex: index + 1,
                stockLength,
                cuts,
                usedLength,
                wasteLength,
                wastePercentage,
                rawMaterial: cuts[0]?.rawMaterial ?? 'unknown',
            };
        });

        const unplacedParts: LinearPart[] = aiResult.unplacedParts.map((p) => {
            const originalPart = parts.find(part => part.length === p.length);
            if (!originalPart) {
                return {
                    id: -1,
                    length: p.length,
                    quantity: p.quantity,
                    effectiveLength: p.length,
                    rawMaterial: 'unknown',
                };
            }
            return {
                ...originalPart,
                quantity: p.quantity,
            };
        });

        const totalWaste = layouts.reduce((sum, l) => sum + l.wasteLength, 0);
        const totalStockLength = layouts.length * stockLength;
        const totalWastePercentage = totalStockLength > 0 ? (totalWaste / totalStockLength) * 100 : 0;

        return {
            layouts,
            unplacedParts,
            totalStockUsed: layouts.length,
            totalWaste,
            totalWastePercentage,
        };
    } catch (error) {
        console.error("AI Linear Nesting Error:", error);
        // Return a result indicating failure, with all parts unplaced.
        return {
            layouts: [],
            unplacedParts: parts,
            totalStockUsed: 0,
            totalWaste: 0,
            totalWastePercentage: 100,
        };
    }
};
