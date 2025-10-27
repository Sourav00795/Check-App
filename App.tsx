
import React, { useState, useMemo, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { HashRouter, Routes, Route, Link, NavLink, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Unit, Material, Sheet, Part, PlacedPart, SheetNestingResult, LinearPart, LinearNestingResult, SheetLayout, StockLayout, RotationOption, OptimizationGoal, OutputDataRow, OutputRules } from './types';
import { MATERIALS, UNITS } from './constants';
import { parseSheetPartsFromColumns, parseLinearParts, convertToBaseUnit, convertFromBaseUnit } from './utils/helpers';
import { performSheetNesting, performLinearNesting } from './services/nestingService';
import { performSheetNestingWithAI, performLinearNestingWithAI, getMaterialDensity } from './services/aiNestingService';
import { findBestPosition } from './services/nestingService';

// --- THEME ---
export type Theme = 'neon' | 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = localStorage.getItem('app-theme');
    return (storedTheme as Theme) || 'neon';
  });

  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(`theme-${theme}`);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// --- TOAST NOTIFICATION ---
interface ToastContextType {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

const Toast: React.FC<{ message: string }> = ({ message }) => {
    return (
        <div className="fixed bottom-10 left-1/2 bg-[color:var(--color-primary)] text-[color:var(--color-text-inv)] px-6 py-3 rounded-full shadow-lg z-50 animate-fade-in-out">
            {message}
        </div>
    );
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toast, setToast] = useState<{ message: string; id: number } | null>(null);

    const showToast = useCallback((message: string) => {
        setToast({ message, id: Date.now() });
    }, []);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => {
                setToast(null);
            }, 3000); // Duration matches CSS animation
            return () => clearTimeout(timer);
        }
    }, [toast]);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {toast && <Toast key={toast.id} message={toast.message} />}
        </ToastContext.Provider>
    );
};


// --- OUTPUT DATA CONTEXT ---
interface OutputDataContextType {
    outputData: OutputDataRow[];
    rules: OutputRules;
    projectName: string;
    setRules: React.Dispatch<React.SetStateAction<OutputRules>>;
    addSheetMetalOutput: (data: OutputDataRow[], newProjectName: string) => void;
    addLinearOutput: (data: OutputDataRow[]) => void;
    clearOutput: () => void;
}

const OutputDataContext = createContext<OutputDataContextType | undefined>(undefined);

export const OutputDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [outputData, setOutputData] = useState<OutputDataRow[]>([]);
    const [projectName, setProjectName] = useState('Untitled Project');
    const [rules, setRules] = useState<OutputRules>({
        utilizationThreshold: 80,
        linearUtilizationThreshold: 80,
        mixedUtilizationMultiplier: 115,
        plateMultiplier: 120,
    });

    const addSheetMetalOutput = (data: OutputDataRow[], newProjectName: string) => {
        setProjectName(newProjectName);
        setOutputData(prev => [
            ...prev.filter(d => d.type !== 'sheet'), // remove old sheet data
            ...data
        ]);
    };

    const addLinearOutput = (data: OutputDataRow[]) => {
        setOutputData(prev => [
            ...prev.filter(d => d.type !== 'linear'), // remove old linear data
            ...data
        ]);
    };
    
    const clearOutput = useCallback(() => {
        setOutputData([]);
        setProjectName('Untitled Project');
    }, []);

    return (
        <OutputDataContext.Provider value={{ outputData, rules, projectName, setRules, addSheetMetalOutput, addLinearOutput, clearOutput }}>
            {children}
        </OutputDataContext.Provider>
    );
};

export const useOutputData = (): OutputDataContextType => {
    const context = useContext(OutputDataContext);
    if (!context) {
        throw new Error('useOutputData must be used within an OutputDataProvider');
    }
    return context;
};


// --- SVG Icons ---
const SunIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>;
const MoonIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg>;
const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M2.25 12l8.954 8.955c.44.439 1.152-.439 1.591 0L21.75 12M12 2.25v2.25m0 15V21.75M8.25 12H2.25m19.5 0h-6m-6.75 5.25-1.591 1.591M18.364 5.636 16.773 7.227" /></svg>;

const SheetMetalIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-[color:var(--color-primary)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6" /></svg>;
const LinearIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-[color:var(--color-primary)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 16h14" /></svg>;
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const DuplicateIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>;
const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>;
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[color:var(--color-text-muted)] hover:text-[color:var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L14.732 3.732z" /></svg>;
const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>;
const ClipboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>;
const Spinner = () => <div className="spinner" role="status" aria-label="loading"></div>;

// --- UI Components ---
const ThemeSwitcher = () => {
    const { theme, setTheme } = useTheme();

    const themes: { name: Theme; icon: React.ReactNode }[] = [
        { name: 'light', icon: <SunIcon /> },
        { name: 'dark', icon: <MoonIcon /> },
        { name: 'neon', icon: <SparklesIcon /> },
    ];

    return (
        <div className="flex items-center space-x-1 bg-[color:color-mix(in_srgb,var(--color-surface)_50%,transparent)] p-1 rounded-full border border-[color:var(--color-border)]">
            {themes.map((t) => (
                <button
                    key={t.name}
                    onClick={() => setTheme(t.name)}
                    className={`p-1.5 rounded-full transition-all duration-300 ${theme === t.name ? 'theme-switcher-active' : 'theme-switcher-inactive'}`}
                    aria-label={`Switch to ${t.name} theme`}
                >
                    <div className="w-5 h-5">{t.icon}</div>
                </button>
            ))}
        </div>
    );
};


const Header = () => (
    <header className="bg-[color:color-mix(in_srgb,var(--color-surface)_50%,transparent)] backdrop-blur-md sticky top-0 z-30 border-b border-[color:color-mix(in_srgb,var(--color-primary)_10%,transparent)]">
        <div className="container mx-auto px-6 py-3 flex justify-between items-center">
            <Link to="/" className="text-2xl font-bold font-display tracking-widest text-[color:var(--color-text)]">NESTING<span className="text-[color:var(--color-primary)]">AI</span></Link>
            <nav className="flex items-center space-x-2 bg-[color:var(--color-surface)] p-1 rounded-full border border-[color:var(--color-border)]">
                 <NavLink to="/sheet-metal" className={({isActive}) => `px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${isActive ? 'bg-[color:color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[color:var(--color-primary)]' : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'}`}>Sheet Metal</NavLink>
                 <NavLink to="/linear-nesting" className={({isActive}) => `px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${isActive ? 'bg-[color:color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[color:var(--color-primary)]' : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'}`}>Linear Materials</NavLink>
                 <NavLink to="/output-data" className={({isActive}) => `px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${isActive ? 'bg-[color:color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[color:var(--color-primary)]' : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'}`}>Output Data</NavLink>
            </nav>
            <ThemeSwitcher />
        </div>
    </header>
);

const Card: React.FC<{ children: React.ReactNode, className?: string, title?: React.ReactNode }> = ({ children, className, title }) => (
    <div className={`glass-card rounded-2xl shadow-2xl ${className}`}>
        {title && <div className="text-lg font-display font-bold text-[color:var(--color-primary)] border-b border-[color:color-mix(in_srgb,var(--color-primary)_20%,transparent)] pb-3 px-6 pt-6">{title}</div>}
        <div className={title ? "p-6 pt-4" : "p-6"}>
          {children}
        </div>
    </div>
);

const InputField: React.FC<{ label: string, value: any, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void, type?: string, children?: React.ReactNode, placeholder?: string, disabled?: boolean, helpText?: string }> = ({ label, value, onChange, type = "number", children, placeholder, disabled, helpText }) => (
    <div>
        <label className="block text-sm font-medium text-[color:var(--color-text-muted)] mb-1">{label}</label>
        {children ? (
            <select value={value} onChange={onChange} disabled={disabled} className="input-field p-2 rounded-md w-full transition disabled:bg-slate-700">
                {children}
            </select>
        ) : (
            <input type={type} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} className="input-field p-2 rounded-md w-full transition disabled:bg-slate-700" />
        )}
        {helpText && <p className="text-xs text-[color:var(--color-text-muted)] opacity-70 mt-1">{helpText}</p>}
    </div>
);

const renderRadioGroup = (label: string, options: string[], selected: string, onChange: (value: string) => void) => (
    <div>
        <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">{label}</label>
        <div className="flex space-x-2 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] p-1 rounded-lg">
            {options.map(opt => (
                <button key={opt} onClick={() => onChange(opt)} className={`flex-1 text-center text-sm px-3 py-1.5 rounded-md transition-all font-medium ${selected === opt ? 'bg-[color:color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[color:var(--color-primary)] shadow-md' : 'text-[color:var(--color-text-muted)] hover:bg-[color:color-mix(in_srgb,var(--color-surface)_100%,#000)]'}`}>
                    {opt}
                </button>
            ))}
        </div>
    </div>
);


// --- Pages ---
const HomePage: React.FC = () => {
    const navigate = useNavigate();
    return (
        <div className="flex-grow container mx-auto p-8">
            <section className="text-center py-16">
                <h1 className="text-6xl font-bold font-display text-[color:var(--color-text)] mb-4">Optimize Your Material Usage</h1>
                <p className="text-lg text-[color:var(--color-text-muted)] max-w-3xl mx-auto">
                    Advanced nesting algorithms for sheet metal and linear materials that minimize waste, reduce costs, and maximize efficiency in your manufacturing operations.
                </p>
            </section>
            
            <section className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                <button onClick={() => navigate('/sheet-metal')} className="glass-card p-8 rounded-2xl hover:border-[color:var(--color-primary)] hover:-translate-y-2 transition-all duration-300 text-center flex flex-col items-center focus:outline-none focus:ring-2 focus:ring-[color:var(--color-primary)] focus:ring-offset-2 focus:ring-offset-[color:var(--color-bg)]">
                    <SheetMetalIcon />
                    <h2 className="text-3xl font-display font-semibold mb-2">Sheet Metal</h2>
                    <p className="text-[color:var(--color-text-muted)]">2D rectangular nesting optimization for sheets.</p>
                </button>
                <button onClick={() => navigate('/linear-nesting')} className="glass-card p-8 rounded-2xl hover:border-[color:var(--color-primary)] hover:-translate-y-2 transition-all duration-300 text-center flex flex-col items-center focus:outline-none focus:ring-2 focus:ring-[color:var(--color-primary)] focus:ring-offset-2 focus:ring-offset-[color:var(--color-bg)]">
                    <LinearIcon />
                    <h2 className="text-3xl font-display font-semibold mb-2">RODs, Pipes &amp; Tubes</h2>
                    <p className="text-[color:var(--color-text-muted)]">1D linear material optimization for rods and pipes.</p>
                </button>
            </section>
        </div>
    );
};


// --- Sheet Metal Page ---
const SheetLayoutSVG: React.FC<{ layout: SheetLayout }> = ({ layout }) => {
    const viewBoxWidth = layout.sheet.length;
    const viewBoxHeight = layout.sheet.width;
    const colorScale = [ '#00f5d4', '#00bbf9', '#9b5de5', '#f15bb5', '#fee440', '#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff' ];

    return (
        <svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className="w-full h-auto border border-[color:var(--color-border)] bg-[color:var(--color-surface)] bg-opacity-30 rounded-lg">
            <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="var(--color-input-bg)" stroke="var(--color-input-border)" />
            {layout.placedParts.map((part) => {
                const partWidth = part.rotated ? part.length : part.width;
                const partHeight = part.rotated ? part.width : part.length;
                return (
                    <g key={part.id}>
                        <rect x={part.x} y={part.y} width={partWidth} height={partHeight} fill={colorScale[part.originalId % colorScale.length]} stroke="var(--color-surface)" strokeWidth="0.5" />
                         <text x={part.x + partWidth / 2} y={part.y + partHeight / 2} fontSize={Math.min(partWidth, partHeight) / 4} textAnchor="middle" dy=".3em" fill="#000" className="pointer-events-none font-sans font-bold">
                            P{part.originalId}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

interface ManualSheetEditorProps {
    manualSheets: Sheet[];
    unit: Unit;
    sheetForecaster: boolean;
    uniqueThicknesses: number[];
    uniqueGrades: string[];
    materialData: Record<string, { density: number | null }>;
    onSheetChange: (id: string, field: keyof Sheet, value: any) => void;
    onAddSheet: () => void;
    onRemoveSheet: (id: string) => void;
    onDuplicateSheet: (id: string) => void;
    onToggleForecaster: (checked: boolean) => void;
}

const ManualSheetEditor: React.FC<ManualSheetEditorProps> = ({
    manualSheets,
    unit,
    sheetForecaster,
    uniqueThicknesses,
    uniqueGrades,
    materialData,
    onSheetChange,
    onAddSheet,
    onRemoveSheet,
    onDuplicateSheet,
    onToggleForecaster
}) => {
    return (
        <div className="space-y-3">
            {manualSheets.map((sheet, index) => {
                const density = sheet.grade && materialData[sheet.grade.toUpperCase()]?.density;
                const sheetWeight = density ? (sheet.length * sheet.width * sheet.thickness / 1_000_000_000) * density : 0;
                const sheetArea = sheet.length * sheet.width;
                
                return (
                    <div key={sheet.id} className="p-4 bg-[color:var(--color-surface)] rounded-lg border border-[color:var(--color-border)]">
                         <div className="flex justify-between items-center">
                            <h4 className="font-semibold text-[color:var(--color-text)]">Sheet #{index + 1}</h4>
                            <div className="flex items-center space-x-2">
                                 <button onClick={() => onDuplicateSheet(sheet.id)} title="Duplicate Sheet" className="p-1.5 text-[color:var(--color-text-muted)] hover:text-[color:var(--color-primary)] hover:bg-[color:var(--color-surface)] rounded-md"><DuplicateIcon /></button>
                                 <button onClick={() => onRemoveSheet(sheet.id)} disabled={manualSheets.length <= 1} title="Remove Sheet" className="p-1.5 text-[color:var(--color-text-muted)] hover:text-red-500 hover:bg-[color:var(--color-surface)] rounded-md disabled:text-slate-600 disabled:hover:bg-transparent"><TrashIcon /></button>
                                 <button onClick={() => onSheetChange(sheet.id, 'isExpanded', !sheet.isExpanded)} className={`p-1 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface)] rounded-md`}><ChevronDownIcon className={`${sheet.isExpanded ? 'rotate-180' : ''}`} /></button>
                            </div>
                        </div>
                        <div className={`transition-[grid-template-rows] duration-500 ease-in-out grid ${sheet.isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                           <div className="overflow-hidden">
                                <div className="space-y-4 pt-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <InputField label={`Length (${unit})`} value={sheet.length} onChange={e => onSheetChange(sheet.id, 'length', parseFloat(e.target.value) || 0)} />
                                        <InputField label={`Width (${unit})`} value={sheet.width} onChange={e => onSheetChange(sheet.id, 'width', parseFloat(e.target.value) || 0)} />
                                        <InputField label="Thickness" value={sheet.thickness} onChange={e => onSheetChange(sheet.id, 'thickness', parseFloat(e.target.value) || 0)}>
                                            <option value="">Select...</option>
                                            {uniqueThicknesses.map(t => <option key={t} value={t}>{t}</option>)}
                                        </InputField>
                                        <InputField label="Grade" value={sheet.grade} onChange={e => onSheetChange(sheet.id, 'grade', e.target.value)}>
                                            <option value="">Select Grade</option>
                                            {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
                                        </InputField>
                                        <InputField label="Quantity" value={sheet.quantity} onChange={e => onSheetChange(sheet.id, 'quantity', parseInt(e.target.value) || 0)} disabled={sheetForecaster} />
                                    </div>
                                    <div className="p-3 bg-[color:var(--color-bg)] border border-[color:var(--color-border)] rounded-md grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                        <div><span className="text-[color:var(--color-text-muted)]">Area/Sheet:</span> <span className="font-semibold">{(sheetArea / 1_000_000).toFixed(2)} m²</span></div>
                                        <div><span className="text-[color:var(--color-text-muted)]">Wt/Sheet:</span> <span className="font-semibold">{sheetWeight > 0 ? `${sheetWeight.toFixed(2)} kg` : '...'}</span></div>
                                        {!sheetForecaster && sheet.quantity > 0 &&
                                            <>
                                            <div><span className="text-[color:var(--color-text-muted)]">Total Area:</span> <span className="font-semibold">{(sheetArea * sheet.quantity / 1_000_000).toFixed(2)} m²</span></div>
                                            <div><span className="text-[color:var(--color-text-muted)]">Total Wt:</span> <span className="font-semibold">{sheetWeight > 0 ? `${(sheetWeight * sheet.quantity).toFixed(2)} kg` : '...'}</span></div>
                                            </>
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })}
            <button onClick={onAddSheet} className="w-full flex items-center justify-center space-x-2 p-2.5 text-sm font-medium text-[color:var(--color-primary)] bg-[color:color-mix(in_srgb,var(--color-primary)_10%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--color-primary)_20%,transparent)] rounded-lg border border-dashed border-[color:var(--color-primary)] border-opacity-50 transition"><PlusIcon /> <span>Add New Sheet</span></button>
             <div className="flex items-center pt-2">
                <input type="checkbox" id="sheet-forecaster" checked={sheetForecaster} onChange={e => onToggleForecaster(e.target.checked)} className="h-4 w-4 rounded border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-primary)] focus:ring-[color:var(--color-primary)]"/>
                <label htmlFor="sheet-forecaster" className="ml-2 block text-sm text-[color:var(--color-text)]">Sheet Forecaster <span className="text-[color:var(--color-text-muted)] opacity-70">(Use unlimited sheets)</span></label>
            </div>
        </div>
    );
};

interface PlacedPartsTableProps {
    layout: SheetLayout;
    unit: Unit;
}

const PlacedPartsTable: React.FC<PlacedPartsTableProps> = ({ layout, unit }) => {
    const partsOnSheet = useMemo(() => {
        const partMap = new Map<number, { originalId: number; name: string; length: number; width: number; quantity: number }>();
        for (const part of layout.placedParts) {
            if (partMap.has(part.originalId)) {
                partMap.get(part.originalId)!.quantity++;
            } else {
                partMap.set(part.originalId, {
                    originalId: part.originalId,
                    name: part.name,
                    length: part.length,
                    width: part.width,
                    quantity: 1,
                });
            }
        }
        return Array.from(partMap.values()).sort((a,b) => a.originalId - b.originalId);
    }, [layout.placedParts]);

    return (
        <div className="mt-4 border-t border-[color:var(--color-border)] pt-4">
            <h5 className="font-semibold text-[color:var(--color-text)] mb-2">Parts on this Sheet</h5>
            <div className="overflow-x-auto max-h-60">
                <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-[color:var(--color-surface)] bg-opacity-80 backdrop-blur-sm">
                        <tr className="border-b border-[color:var(--color-border)]">
                            <th className="p-2 font-semibold text-[color:var(--color-text-muted)]">S.No.</th>
                            <th className="p-2 font-semibold text-[color:var(--color-text-muted)]">Part Name</th>
                            <th className="p-2 font-semibold text-[color:var(--color-text-muted)]">Length</th>
                            <th className="p-2 font-semibold text-[color:var(--color-text-muted)]">Width</th>
                            <th className="p-2 font-semibold text-[color:var(--color-text-muted)]">Qty</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--color-border)]">
                        {partsOnSheet.map(p => (
                            <tr key={p.originalId} className="hover:bg-[color:var(--color-input-bg)]">
                                <td className="p-2 text-[color:var(--color-text-muted)]">{p.originalId}</td>
                                <td className="p-2 font-medium">{p.name}</td>
                                <td className="p-2">{convertFromBaseUnit(p.length, unit).toFixed(1)}</td>
                                <td className="p-2">{convertFromBaseUnit(p.width, unit).toFixed(1)}</td>
                                <td className="p-2">{p.quantity}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


const SheetMetalPage: React.FC = () => {
    // State Management
    const [projectName, setProjectName] = useState('Untitled Project');
    const [isEditingProjectName, setIsEditingProjectName] = useState(false);
    const [tempProjectName, setTempProjectName] = useState('Untitled Project');
    const [manualSheets, setManualSheets] = useState<Sheet[]>([{ id: `sheet-${Date.now()}`, length: 3000, width: 1250, thickness: 3, grade: 'MS', quantity: 1, isExpanded: true }]);
    const [sheetMode, setSheetMode] = useState<'manual' | 'automatic'>('automatic');
    const [sheetForecaster, setSheetForecaster] = useState(false);
    const [partsInput, setPartsInput] = useState({ names: '', lengths: '', widths: '', thicknesses: '', grades: '', quantities: '' });
    const [settings, setSettings] = useState({
        rotation: RotationOption.NINETY,
        optimizationGoal: OptimizationGoal.PRIORITIZE_SPEED,
        partToPart: 5,
        partToSheet: 10,
        unit: Unit.MM
    });
    const [customizationConfig, setCustomizationConfig] = useState({
        minPartLengthForCustom: 1230, // mm, Rule 1
        minQuantity: 25, // Rule 1
        minWeight: 3, // tons, Rule 1
        lengthExtension: 20, // mm, Rule 2 (end margin)
        minCustomLength: 1230, // mm, Rule 2
        maxLength: 4000, // mm, Rule 2
        minWeightFor1500Width: 5, // tons, Rule 5
        thicknessesFor1500Width: [8, 10, 12, 16], // Rule 5
    });
    const [editCustomConfig, setEditCustomConfig] = useState(false);
    const [inputMode, setInputMode] = useState<'input' | 'table'>('input');
    const [materialData, setMaterialData] = useState<Record<string, { density: number | null; sources: any[] | undefined }>>({});
    
    const [errors, setErrors] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<SheetNestingResult | null>(null);
    const [expandedLayouts, setExpandedLayouts] = useState<Set<number>>(new Set());
    
    const { addSheetMetalOutput, rules } = useOutputData();
    const navigate = useNavigate();

    const handleProjectNameSave = () => {
        setProjectName(tempProjectName.trim() || 'Untitled Project');
        setIsEditingProjectName(false);
    };

    const handleEditClick = () => {
        setTempProjectName(projectName);
        setIsEditingProjectName(true);
    };

    // Memoized Derived State
    const { parsedParts, parseErrors } = useMemo(() => {
        const { parts, errors } = parseSheetPartsFromColumns(partsInput.names, partsInput.lengths, partsInput.widths, partsInput.thicknesses, partsInput.grades, partsInput.quantities);
        return { parsedParts: parts, parseErrors: errors };
    }, [partsInput]);
    
    const consolidatedParts = useMemo(() => {
        const partsMap = new Map<string, Part>();
        parsedParts.forEach(part => {
            const key = `${part.name}|${part.length}|${part.width}|${part.thickness}|${part.grade}`.toLowerCase();
            if (partsMap.has(key)) {
                const existing = partsMap.get(key)!;
                existing.quantity += part.quantity;
            } else {
                partsMap.set(key, { ...part });
            }
        });
        return Array.from(partsMap.values()).map((p, i) => ({ ...p, originalId: i + 1 }));
    }, [parsedParts]);

    const fetchDensityForGrade = useCallback((grade: string) => {
        if (grade && materialData[grade] === undefined) {
            setMaterialData(prev => ({ ...prev, [grade]: { density: null, sources: undefined } }));
            getMaterialDensity(grade).then(data => {
                if (data.density !== null) {
                    setMaterialData(prev => ({ ...prev, [grade]: data }));
                } else {
                    setMaterialData(prev => ({ ...prev, [grade]: { density: 7850, sources: [] } })); // Default fallback
                }
            });
        }
    }, [materialData]);

    useEffect(() => {
        const gradesFromParts = [...new Set(consolidatedParts.map(p => p.grade.trim().toUpperCase()))];
        gradesFromParts.forEach(fetchDensityForGrade);
        
        if(sheetMode === 'manual'){
            const gradesFromSheets = [...new Set(manualSheets.map(s => s.grade.trim().toUpperCase()))];
            gradesFromSheets.forEach(fetchDensityForGrade);
        }
    }, [consolidatedParts, manualSheets, sheetMode, fetchDensityForGrade]);


    const { uniqueGrades, uniqueThicknesses } = useMemo(() => {
        const gradeSet = new Set<string>();
        const thicknessSet = new Set<number>();
        parsedParts.forEach(p => {
            if(p.grade) gradeSet.add(p.grade.trim().toUpperCase());
            if(p.thickness) thicknessSet.add(p.thickness);
        });
        return { uniqueGrades: Array.from(gradeSet).sort(), uniqueThicknesses: Array.from(thicknessSet).sort((a,b) => a - b) };
    }, [parsedParts]);

    // Handlers
    const handlePartsInputChange = (field: keyof typeof partsInput, value: string) => {
        setPartsInput(prev => ({ ...prev, [field]: value }));
        setResults(null);
    };
    
    const handleSettingsChange = <K extends keyof typeof settings>(field: K, value: typeof settings[K]) => {
        setSettings(prev => ({...prev, [field]: value} as typeof prev));
    };

    const handleManualSheetChange = (id: string, field: keyof Sheet, value: any) => {
      setManualSheets(prev => prev.map(s => s.id === id ? {...s, [field]: value} : s));
    };

    const handleAddManualSheet = () => {
        const newSheet: Sheet = {
            id: `sheet-${Date.now()}`,
            length: 3000, width: 1250, thickness: 3, grade: 'MS', quantity: 1, isExpanded: true
        };
        setManualSheets(prev => [...prev, newSheet]);
    };
    
    const handleRemoveManualSheet = (id: string) => {
        if (manualSheets.length > 1) {
            setManualSheets(prev => prev.filter(s => s.id !== id));
        }
    };
    
    const handleDuplicateManualSheet = (id: string) => {
        const sheetToCopy = manualSheets.find(s => s.id === id);
        if(sheetToCopy) {
            const newSheet: Sheet = { ...sheetToCopy, id: `sheet-${Date.now()}`, isExpanded: true };
            setManualSheets(prev => [...prev, newSheet]);
        }
    };

    const handleCustomConfigChange = <K extends keyof typeof customizationConfig>(field: K, value: typeof customizationConfig[K]) => {
        setCustomizationConfig(prev => ({ ...prev, [field]: value } as typeof prev));
    };

    const handleClear = () => {
        setPartsInput({ names: '', lengths: '', widths: '', thicknesses: '', grades: '', quantities: '' });
        setProjectName('Untitled Project');
        setTempProjectName('Untitled Project');
    };
    const handleSample = () => {
        setPartsInput({
            names: 'Side Panel\nTop Plate\nBracket\nStiffener\nBase Plate\nLong Gusset\nSmall Part',
            lengths: '1000\n500\n1200\n750\n200\n1260\n150',
            widths: '500\n250\n400\n300\n1250\n500\n100',
            thicknesses: '3\n3\n3\n5\n3\n3\n3',
            grades: 'MS\nMS\nMS\nIS 2062\nMS\nMS\nMS',
            quantities: '2\n4\n1\n3\n10\n250\n50',
        });
        setManualSheets([{ id: `sheet-${Date.now()}`, length: 3000, width: 1250, thickness: 3, grade: 'MS', quantity: 10, isExpanded: true }]);
        setInputMode('table');
    };
    
    const handlePasteCsv = async () => {
        try {
            const csvText = await navigator.clipboard.readText();
            const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const columns = { names: [] as string[], lengths: [] as string[], widths: [] as string[], thicknesses: [] as string[], grades: [] as string[], quantities: [] as string[] };
            lines.forEach(line => {
                const fields = line.split(/[,	]/).map(f => f.trim()); // Split by comma or tab
                if (fields.length === 6) {
                    columns.names.push(fields[0]);
                    columns.lengths.push(fields[1]);
                    columns.widths.push(fields[2]);
                    columns.thicknesses.push(fields[3]);
                    columns.grades.push(fields[4]);
                    columns.quantities.push(fields[5]);
                }
            });
            setPartsInput({
                names: columns.names.join('\n'),
                lengths: columns.lengths.join('\n'),
                widths: columns.widths.join('\n'),
                thicknesses: columns.thicknesses.join('\n'),
                grades: columns.grades.join('\n'),
                quantities: columns.quantities.join('\n'),
            });
        } catch (err) {
            console.error('Failed to read clipboard contents: ', err);
            alert('Could not paste from clipboard. Please ensure you have given permission.');
        }
    };

    const nestRunner = useCallback(async (sheets: Sheet[], parts: Part[], grade: string): Promise<SheetNestingResult> => {
        const partToPartDist = convertToBaseUnit(settings.partToPart, settings.unit);
        const partToSheetDist = convertToBaseUnit(settings.partToSheet, settings.unit);
        
        if (parts.length === 0 || sheets.length === 0) {
            return { layouts: [], unplacedParts: parts, totalSheetsUsed: {}, totalUsedWeight: 0, totalWasteWeight: 0, totalWastePercentage: 0, totalUsedArea: 0, totalSheetArea: 0 };
        }
        const material = { name: grade, density: materialData[grade.toUpperCase()]?.density || 7850 };
         if (settings.optimizationGoal === OptimizationGoal.MINIMIZE_WASTE) {
             return performSheetNestingWithAI(sheets, parts, partToPartDist, partToSheetDist, settings.rotation, material);
         }
         return performSheetNesting(sheets, parts, partToPartDist, partToSheetDist, settings.rotation, material);
    }, [settings, materialData]);

    const findBestStandardNesting = useCallback(async (parts: Part[], grade: string, thickness: number): Promise<SheetNestingResult> => {
        const specialThicknesses = customizationConfig.thicknessesFor1500Width;
        let standardSheets: Sheet[];

        if (specialThicknesses.includes(thickness)) {
            // Rule: For these thicknesses, only use 3000x1500 sheets.
            standardSheets = [
                { id: `s3-${grade}-${thickness}`, length: 3000, width: 1500, thickness, grade, quantity: Number.MAX_SAFE_INTEGER, isExpanded: false }
            ];
        } else {
            // Logic for other thicknesses
            standardSheets = [
                { id: `s1-${grade}-${thickness}`, length: 2500, width: 1250, thickness, grade, quantity: Number.MAX_SAFE_INTEGER, isExpanded: false },
                { id: `s2-${grade}-${thickness}`, length: 3000, width: 1250, thickness, grade, quantity: Number.MAX_SAFE_INTEGER, isExpanded: false },
            ];
        
            // Retain original logic for other thick plates (>=8) or parts that need the width
            const needs1500Width = thickness >= 8 || parts.some(p => 
                (p.width > 1250 && p.width <= 1500 && p.length <= 3000) ||
                (settings.rotation !== RotationOption.NONE && p.length > 1250 && p.length <= 1500 && p.width <= 3000)
            );
            if (needs1500Width) {
                 standardSheets.push({ id: `s3-${grade}-${thickness}`, length: 3000, width: 1500, thickness, grade, quantity: Number.MAX_SAFE_INTEGER, isExpanded: false });
            }
        }
        
        return nestRunner(standardSheets, parts, grade);
    }, [nestRunner, settings.rotation, customizationConfig.thicknessesFor1500Width]);

    const handleNest = async () => {
        setLoading(true);
        setResults(null);
        setErrors(parseErrors);

        if (parseErrors.length > 0) {
            setLoading(false);
            return;
        }
        
        const partsInBaseUnit = consolidatedParts.map(p => ({...p, length: convertToBaseUnit(p.length, settings.unit), width: convertToBaseUnit(p.width, settings.unit) }));
        const partToPartDist = convertToBaseUnit(settings.partToPart, settings.unit);
        const partToSheetDist = convertToBaseUnit(settings.partToSheet, settings.unit);

        if (sheetMode === 'manual') {
            const sheetsForNesting = manualSheets.map(s => ({
              ...s,
              length: convertToBaseUnit(s.length, settings.unit),
              width: convertToBaseUnit(s.width, settings.unit),
              quantity: sheetForecaster ? Number.MAX_SAFE_INTEGER : s.quantity,
            }));

            nestRunner(sheetsForNesting, partsInBaseUnit, "MS").then(setResults).catch(e => {
                console.error("Nesting Error:", e);
                setErrors(["An error occurred with the nesting service."]);
            }).finally(() => setLoading(false));

        } else { // --- AUTOMATIC MODE LOGIC ---
            
            let allLayouts: SheetLayout[] = [];
            const finalUnplaced: Part[] = [];
            const finalSheetsUsed: { [key: string]: number } = {};

            // 1. Separate parts into custom and standard groups
            const customEligibleParts: Part[] = [];
            const standardParts: Part[] = [];

            for (const part of partsInBaseUnit) {
                const density = materialData[part.grade.toUpperCase()]?.density || 7850;
                const partWeightKg = (part.length * part.width * part.thickness / 1_000_000_000) * density;
                const totalPartWeightTons = (partWeightKg * part.quantity) / 1000;

                const isBatchEligible =
                    part.quantity > customizationConfig.minQuantity &&
                    totalPartWeightTons > customizationConfig.minWeight;

                const fitsStandard =
                    (part.length <= 3000 && part.width <= 1500) ||
                    (settings.rotation !== RotationOption.NONE && part.width <= 3000 && part.length <= 1500);

                if (isBatchEligible || !fitsStandard) {
                    customEligibleParts.push(part);
                } else {
                    standardParts.push(part);
                }
            }

            // 2. Process each custom-eligible part to generate its base layouts
            for (const customPart of customEligibleParts) {
                const startMargin = partToSheetDist;
                const endMargin = customizationConfig.lengthExtension;
                const gap = partToPartDist;
                const maxLen = customizationConfig.maxLength;
                const minLen = customizationConfig.minCustomLength;
                
                const dimToLayout = Math.max(customPart.length, customPart.width);
                const otherDim = Math.min(customPart.length, customPart.width);
                
                let n = Math.floor((maxLen - startMargin - endMargin + gap) / (dimToLayout + gap));
                n = Math.max(1, n);

                let customLength = startMargin + (n * dimToLayout) + ((n - 1) * gap) + endMargin;
                customLength = Math.ceil(customLength / 10) * 10;
                customLength = Math.max(minLen, Math.min(maxLen, customLength));

                let customWidth = 1250;
                const density = materialData[customPart.grade.toUpperCase()]?.density || 7850;
                const totalPartWeightTons = ((customPart.length * customPart.width * customPart.thickness / 1_000_000_000) * density * customPart.quantity) / 1000;
                const needs1500 = totalPartWeightTons > customizationConfig.minWeightFor1500Width || customizationConfig.thicknessesFor1500Width.includes(customPart.thickness) || (otherDim + 2 * startMargin > 1250);
                if (needs1500) customWidth = 1500;
                
                if ((otherDim + 2 * startMargin) > customWidth) {
                    finalUnplaced.push(customPart); continue;
                }

                const customSheet: Sheet = {
                    id: `custom-${customPart.grade}-${customPart.thickness}-${customPart.originalId}`,
                    length: customLength, width: customWidth, thickness: customPart.thickness, grade: customPart.grade, quantity: Number.MAX_SAFE_INTEGER, isExpanded: false
                };

                const resultForPart = await nestRunner([customSheet], [customPart], customPart.grade);
                allLayouts.push(...resultForPart.layouts);
                finalUnplaced.push(...resultForPart.unplacedParts);
                Object.keys(resultForPart.totalSheetsUsed).forEach(k => finalSheetsUsed[k] = (finalSheetsUsed[k] || 0) + resultForPart.totalSheetsUsed[k]);
            }

            // 3. FILLER LOGIC: Attempt to place standard parts in custom sheet empty spaces
            const standardPartQuantities = new Map<number, number>();
            standardParts.forEach(p => standardPartQuantities.set(p.originalId, p.quantity));

            for (const layout of allLayouts) {
                const compatibleFillers = standardParts.filter(p => p.grade === layout.sheet.grade && p.thickness === layout.sheet.thickness);
                if (compatibleFillers.length === 0) continue;

                let placedSomethingInPass = true;
                while (placedSomethingInPass) {
                    placedSomethingInPass = false;
                    compatibleFillers.sort((a, b) => (b.length * b.width) - (a.length * a.width)); // Prioritize largest

                    for (const filler of compatibleFillers) {
                        const remainingQty = standardPartQuantities.get(filler.originalId);
                        if (remainingQty && remainingQty > 0) {
                            const position = findBestPosition(filler, layout.sheet, layout.placedParts, partToPartDist, partToSheetDist, settings.rotation);
                            if (position) {
                                layout.placedParts.push({ ...filler, ...position, quantity: 1, id: filler.id * 10000 + Math.random() * 1000 });
                                standardPartQuantities.set(filler.originalId, remainingQty - 1);
                                placedSomethingInPass = true;
                                break; 
                            }
                        }
                    }
                }
            }
             
            // Recalculate metrics for the now-filled custom layouts
            allLayouts.forEach(layout => {
                const sheetArea = layout.sheet.length * layout.sheet.width;
                layout.usedArea = layout.placedParts.reduce((acc, p) => acc + p.length * p.width, 0);
                layout.wasteArea = sheetArea - layout.usedArea;
                layout.wastePercentage = sheetArea > 0 ? (layout.wasteArea / sheetArea) * 100 : 0;
                
                const density = materialData[layout.sheet.grade.toUpperCase()]?.density || 7850;
                const volumeToWeight = (area: number) => (area / 1_000_000) * layout.sheet.thickness * density / 1000;
                layout.usedWeight = volumeToWeight(layout.usedArea);
                layout.wasteWeight = volumeToWeight(layout.wasteArea);
            });

            // 4. Process remaining standard parts
            const remainingStandardParts = standardParts.map(p => ({ ...p, quantity: standardPartQuantities.get(p.originalId) || 0 })).filter(p => p.quantity > 0);
            const standardPartGroups = remainingStandardParts.reduce((acc, part) => {
                const key = `${part.grade}-${part.thickness}`;
                if (!acc[key]) acc[key] = [];
                acc[key].push(part);
                return acc;
            }, {} as Record<string, Part[]>);

            for (const key of Object.keys(standardPartGroups)) {
                const [grade, thicknessStr] = key.split('-');
                const thickness = parseFloat(thicknessStr);
                const partsInGroup = standardPartGroups[key];
                if (partsInGroup.length > 0) {
                    const standardResult = await findBestStandardNesting(partsInGroup, grade, thickness);
                    allLayouts.push(...standardResult.layouts);
                    finalUnplaced.push(...standardResult.unplacedParts);
                    Object.keys(standardResult.totalSheetsUsed).forEach(k => finalSheetsUsed[k] = (finalSheetsUsed[k] || 0) + standardResult.totalSheetsUsed[k]);
                }
            }
            
            // 5. Aggregate final results
            const finalResult: SheetNestingResult = { layouts: [], unplacedParts: [], totalSheetsUsed: {}, totalUsedWeight: 0, totalWasteWeight: 0, totalWastePercentage: 0, totalUsedArea: 0, totalSheetArea: 0 };
            finalResult.layouts = allLayouts.map((l, i) => ({ ...l, sheetIndex: i + 1 }));
            finalResult.unplacedParts = finalUnplaced;
            finalResult.totalSheetsUsed = finalSheetsUsed;
            finalResult.totalUsedArea = allLayouts.reduce((sum, l) => sum + l.usedArea, 0);
            finalResult.totalSheetArea = allLayouts.reduce((sum, l) => sum + l.sheet.length * l.sheet.width, 0);
            finalResult.totalUsedWeight = allLayouts.reduce((sum, l) => sum + l.usedWeight, 0);
            finalResult.totalWasteWeight = allLayouts.reduce((sum, l) => sum + l.wasteWeight, 0);
            finalResult.totalWastePercentage = finalResult.totalSheetArea > 0 ? ((finalResult.totalSheetArea - finalResult.totalUsedArea) / finalResult.totalSheetArea) * 100 : 0;
            
            setResults(finalResult);
            setLoading(false);
        }
    };

    const handleAddOutputData = () => {
        if (!results || !sheetSummaryData) return;

        const newOutputData: OutputDataRow[] = sheetSummaryData.map(summary => {
            const isPlate = summary.sheet.thickness > 16;
            const isCustom = summary.isCustom;
            
            let description = `${summary.materialGrade} `;
            if (isPlate) {
                description += `Plate ${summary.sheet.thickness} Thk`;
            } else {
                description += `Sheet ${summary.sheetDescription}`;
            }

            let weightKg = '0.00';
            const relevantLayouts = results.layouts.filter(l => {
                 const sheet = l.sheet;
                 const key = `${sheet.length}x${sheet.width}x${sheet.thickness}x${sheet.grade}`;
                 const summaryKey = `${summary.sheet.length}x${summary.sheet.width}x${summary.sheet.thickness}x${summary.sheet.grade}`;
                 return key === summaryKey;
            });

            if (isPlate) {
                weightKg = (summary.totalUtilizedWeight * (rules.plateMultiplier / 100)).toFixed(2);
            } else {
                const highUtilLayouts = relevantLayouts.filter(l => (100 - l.wastePercentage) >= rules.utilizationThreshold);
                const lowUtilLayouts = relevantLayouts.filter(l => (100 - l.wastePercentage) < rules.utilizationThreshold);

                if (lowUtilLayouts.length === 0) { // All high utilization
                    weightKg = summary.totalSheetWeight;
                } else if (highUtilLayouts.length === 0) { // All low utilization
                    weightKg = summary.utilizedWeight;
                } else { // Mixed utilization
                    const density = materialData[summary.materialGrade.toUpperCase()]?.density || 7850;
                    const getSheetWeight = (sheet: Sheet) => (sheet.length * sheet.width * sheet.thickness / 1_000_000_000) * density;
                    
                    const highUtilSheetWeight = highUtilLayouts.reduce((sum, l) => sum + getSheetWeight(l.sheet), 0);
                    const lowUtilUsedWeight = lowUtilLayouts.reduce((sum, l) => sum + l.usedWeight, 0);

                    weightKg = ((highUtilSheetWeight + lowUtilUsedWeight) * (rules.mixedUtilizationMultiplier / 100)).toFixed(2);
                }
            }

            return {
                id: `sheet-${summary.sheetDescription}-${summary.materialGrade}`,
                type: 'sheet',
                description,
                lengthMtr: isCustom ? 'Customized' : '',
                weightKg,
                remarks: ''
            };
        });
        
        addSheetMetalOutput(newOutputData, projectName);
        navigate('/output-data');
    };

    const renderTextarea = (field: keyof typeof partsInput, placeholder: string) => (
        <div className="flex-1">
            <label className="block text-center text-sm font-medium text-[color:var(--color-text-muted)] mb-2">{placeholder}</label>
            <textarea
                value={partsInput[field]}
                onChange={e => handlePartsInputChange(field, e.target.value)}
                placeholder={`e.g.\n${placeholder === 'Part Name' ? 'Side Plate' : placeholder === 'Length' ? '25' : placeholder === 'Width' ? '50' : placeholder === 'Thickness' ? '3' : placeholder === 'Material' ? 'MS' : '2'}`}
                className="input-field p-2 rounded-md w-full h-64 font-mono text-sm transition"
            />
        </div>
    );
    
    const renderPreviewTable = () => {
        const totalParts = consolidatedParts.length;
        const totalQuantity = consolidatedParts.reduce((sum, p) => sum + p.quantity, 0);
        const totalArea = consolidatedParts.reduce((sum, p) => sum + (p.length * p.width * p.quantity), 0);
        
        const weightByMaterial = consolidatedParts.reduce((acc, p) => {
            const key = `${p.grade} x ${p.thickness}mm`;
            const density = materialData[p.grade.toUpperCase()]?.density;
            if (!density) return acc;
            const partWeight = (p.length * p.width * p.thickness / 1_000_000_000) * density;
            const totalWeight = partWeight * p.quantity;
            acc[key] = (acc[key] || 0) + totalWeight;
            return acc;
        }, {} as Record<string, number>);

        return (
            <div className="space-y-4">
                <div className="overflow-x-auto border border-[color:var(--color-border)] rounded-lg bg-[color:var(--color-surface)]">
                    <table className="min-w-full text-sm">
                        <thead className="bg-[color:var(--color-bg)] text-left">
                            <tr>
                                {['S.No.', 'Part Name', `L (${settings.unit})`, `W (${settings.unit})`, `Thk (${settings.unit})`, 'Grade', 'Qty', 'Wt/Part (kg)', 'Total Wt (kg)'].map(h => 
                                    <th key={h} className="p-3 font-semibold text-[color:var(--color-text-muted)]">{h}</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[color:var(--color-border)]">
                            {consolidatedParts.map(p => {
                                const density = materialData[p.grade.toUpperCase()]?.density;
                                const partWeight = density ? (p.length * p.width * p.thickness / 1_000_000_000) * density : null;
                                return (
                                <tr key={p.originalId} className="hover:bg-[color:var(--color-input-bg)] transition-colors">
                                    <td className="p-3 text-[color:var(--color-text-muted)]">{p.originalId}</td>
                                    <td className="p-3 font-medium text-[color:var(--color-text)]">{p.name}</td>
                                    <td className="p-3">{p.length}</td>
                                    <td className="p-3">{p.width}</td>
                                    <td className="p-3">{p.thickness}</td>
                                    <td className="p-3">{p.grade}</td>
                                    <td className="p-3">{p.quantity}</td>
                                    <td className="p-3">{partWeight ? partWeight.toFixed(2) : '...'}</td>
                                    <td className="p-3 font-semibold">{partWeight ? (partWeight * p.quantity).toFixed(2) : '...'}</td>
                                </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                 {/* Input Summary */}
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-[color:var(--color-surface)] p-3 rounded-lg border border-[color:var(--color-border)]"><div className="text-xs text-[color:var(--color-text-muted)]">Total Parts</div><div className="font-bold text-lg text-[color:var(--color-primary)]">{totalParts}</div></div>
                    <div className="bg-[color:var(--color-surface)] p-3 rounded-lg border border-[color:var(--color-border)]"><div className="text-xs text-[color:var(--color-text-muted)]">Total Quantity</div><div className="font-bold text-lg text-[color:var(--color-primary)]">{totalQuantity}</div></div>
                    <div className="bg-[color:var(--color-surface)] p-3 rounded-lg border border-[color:var(--color-border)]"><div className="text-xs text-[color:var(--color-text-muted)]">Total Area ({settings.unit}²)</div><div className="font-bold text-lg text-[color:var(--color-primary)]">{(totalArea).toLocaleString(undefined, {maximumFractionDigits: 0})}</div></div>
                </div>
                 {/* Consolidated Weight Summary */}
                {Object.keys(weightByMaterial).length > 0 &&
                    <div className="bg-[color:color-mix(in_srgb,var(--color-primary)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--color-primary)_30%,transparent)] p-4 rounded-lg space-y-2">
                         <h4 className="font-semibold text-[color:var(--color-primary)] text-base">Consolidated Weight by Material</h4>
                         <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                         {Object.entries(weightByMaterial).map(([key, value]) => (
                             <div key={key} className="flex justify-between text-[color:var(--color-text)]">
                                 <span className="font-medium">{key}:</span>
                                 <span className="font-bold">{(value as number).toFixed(2)} kg</span>
                             </div>
                         ))}
                         </div>
                    </div>
                }
            </div>
        );
    };
    
    const renderCustomizationConfig = () => {
        const renderParam = (label: string, value: string) => (
             <div className="text-sm"><span className="text-[color:var(--color-text-muted)]">{label}:</span> <span className="font-semibold text-[color:var(--color-text)]">{value}</span></div>
        );
        return (
            <div className="mt-4 space-y-4 p-4 bg-[color:var(--color-surface)] rounded-lg border border-[color:var(--color-border)]">
                <h4 className="font-semibold text-[color:var(--color-text)]">Customized Sheet Rules</h4>
                {!editCustomConfig ? (
                    <div className="space-y-3">
                        <div>
                            <h5 className="text-sm font-semibold text-[color:var(--color-text-muted)] mb-1">Part Eligibility Rules</h5>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-2 border-l-2 border-[color:var(--color-border)]">
                                {renderParam("Min Part Length", `> ${customizationConfig.minPartLengthForCustom} mm`)}
                                {renderParam("Min Part Qty", `> ${customizationConfig.minQuantity}`)}
                                {renderParam("Min Part Wt", `> ${customizationConfig.minWeight} tons`)}
                            </div>
                        </div>
                        <div>
                            <h5 className="text-sm font-semibold text-[color:var(--color-text-muted)] mb-1">Sheet Sizing Rules</h5>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-2 border-l-2 border-[color:var(--color-border)]">
                                {renderParam("Sheet End Margin", `+${customizationConfig.lengthExtension} mm`)}
                                {renderParam("Min Sheet Length", `${customizationConfig.minCustomLength} mm`)}
                                {renderParam("Max Sheet Length", `${customizationConfig.maxLength} mm`)}
                            </div>
                        </div>
                        <div>
                            <h5 className="text-sm font-semibold text-[color:var(--color-text-muted)] mb-1">1500mm Width Rules</h5>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-2 border-l-2 border-[color:var(--color-border)]">
                                {renderParam("Min Wt for 1500mm", `> ${customizationConfig.minWeightFor1500Width} tons`)}
                                {renderParam("Thk for 1500mm", `${customizationConfig.thicknessesFor1500Width.join(', ')} mm`)}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <h5 className="text-sm font-semibold text-[color:var(--color-text-muted)] mb-2">Part Eligibility Rules</h5>
                            <div className="grid grid-cols-2 gap-4 pl-2 border-l-2 border-[color:color-mix(in_srgb,var(--color-primary)_30%,transparent)]">
                                <InputField label="Min Part L (mm)" value={customizationConfig.minPartLengthForCustom} onChange={e => handleCustomConfigChange('minPartLengthForCustom', parseFloat(e.target.value))} />
                                <InputField label="Min Part Qty" value={customizationConfig.minQuantity} onChange={e => handleCustomConfigChange('minQuantity', parseInt(e.target.value))} />
                                <InputField label="Min Part Wt (t)" value={customizationConfig.minWeight} onChange={e => handleCustomConfigChange('minWeight', parseFloat(e.target.value))} />
                            </div>
                        </div>
                        <div>
                            <h5 className="text-sm font-semibold text-[color:var(--color-text-muted)] mb-2">Sheet Sizing Rules</h5>
                            <div className="grid grid-cols-2 gap-4 pl-2 border-l-2 border-[color:color-mix(in_srgb,var(--color-primary)_30%,transparent)]">
                                <InputField label="End Margin (mm)" value={customizationConfig.lengthExtension} onChange={e => handleCustomConfigChange('lengthExtension', parseFloat(e.target.value))} />
                                <InputField label="Min Sheet L (mm)" value={customizationConfig.minCustomLength} onChange={e => handleCustomConfigChange('minCustomLength', parseFloat(e.target.value))} />
                                <InputField label="Max Sheet L (mm)" value={customizationConfig.maxLength} onChange={e => handleCustomConfigChange('maxLength', parseFloat(e.target.value))} />
                            </div>
                        </div>
                        <div>
                            <h5 className="text-sm font-semibold text-[color:var(--color-text-muted)] mb-2">1500mm Width Rules</h5>
                            <div className="grid grid-cols-2 gap-4 pl-2 border-l-2 border-[color:color-mix(in_srgb,var(--color-primary)_30%,transparent)]">
                                <InputField label="1500mm Min Wt (t)" value={customizationConfig.minWeightFor1500Width} onChange={e => handleCustomConfigChange('minWeightFor1500Width', parseFloat(e.target.value))} />
                                <InputField 
                                    label="1500mm Width Thk (mm)" 
                                    type="text"
                                    value={customizationConfig.thicknessesFor1500Width.join(', ')} 
                                    onChange={e => {
                                        const stringValue = e.target.value;
                                        const numberArray = stringValue.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
                                        handleCustomConfigChange('thicknessesFor1500Width', numberArray);
                                    }}
                                    helpText="Comma-separated values."
                                />
                            </div>
                        </div>
                    </div>
                )}
                 <div className="flex items-center pt-2">
                    <input type="checkbox" id="edit-custom-config" checked={editCustomConfig} onChange={e => setEditCustomConfig(e.target.checked)} className="h-4 w-4 rounded border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-primary)] focus:ring-[color:var(--color-primary)]"/>
                    <label htmlFor="edit-custom-config" className="ml-2 block text-sm text-[color:var(--color-text)]">Edit Parameters</label>
                </div>
            </div>
        )
    };
    
    const groupedLayouts = useMemo(() => {
        if (!results?.layouts) return [];

        const layoutMap = new Map<string, { layout: SheetLayout; quantity: number; sheetIndices: number[] }>();

        for (const layout of results.layouts) {
            const partsKey = layout.placedParts
                .map(p => ({ id: p.originalId, x: p.x, y: p.y, r: p.rotated }))
                .sort((a, b) => a.id - b.id || a.x - b.x || a.y - b.y)
                .map(p => `${p.id}@${p.x.toFixed(2)},${p.y.toFixed(2)}${p.r ? 'R' : ''}`)
                .join(';');

            const sheetKey = `${layout.sheet.length.toFixed(2)}x${layout.sheet.width.toFixed(2)}x${layout.sheet.thickness}x${layout.sheet.grade}`;
            const groupKey = `${sheetKey}|${partsKey}`;

            if (layoutMap.has(groupKey)) {
                const entry = layoutMap.get(groupKey)!;
                entry.quantity++;
                entry.sheetIndices.push(layout.sheetIndex);
            } else {
                layoutMap.set(groupKey, { layout, quantity: 1, sheetIndices: [layout.sheetIndex] });
            }
        }
        
        for (const entry of layoutMap.values()) {
            entry.sheetIndices.sort((a, b) => a - b);
        }

        const grouped = Array.from(layoutMap.values());

        const getSheetSizeRank = (sheet: Sheet) => {
            const { length, width } = sheet;
            // Standard sizes
            if (length === 2500 && width === 1250) return 1;
            if (length === 3000 && width === 1250) return 2;
            if (length === 3000 && width === 1500) return 3;
            
            // Custom sizes with standard widths
            if (width === 1250) return 4;
            if (width === 1500) return 5;
            
            return 6; // Fallback for any other sizes
        };

        grouped.sort((a, b) => {
            const sheetA = a.layout.sheet;
            const sheetB = b.layout.sheet;

            // 1. Thickness (Ascending)
            const thicknessDiff = sheetA.thickness - sheetB.thickness;
            if (thicknessDiff !== 0) return thicknessDiff;

            // 2. Sheet Size (Specific Order, then ascending for custom sizes)
            const rankA = getSheetSizeRank(sheetA);
            const rankB = getSheetSizeRank(sheetB);
            const rankDiff = rankA - rankB;
            if (rankDiff !== 0) return rankDiff;
            
            // If ranks are the same (e.g., two custom sheets), sort by length then width
            const lengthDiff = sheetA.length - sheetB.length;
            if (lengthDiff !== 0) return lengthDiff;

            const widthDiff = sheetA.width - sheetB.width;
            if (widthDiff !== 0) return widthDiff;

            // 3. Utilization (Descending)
            const utilizationA = 100 - a.layout.wastePercentage;
            const utilizationB = 100 - b.layout.wastePercentage;
            return utilizationB - utilizationA;
        });

        return grouped;
    }, [results]);

    const sheetSummaryData = useMemo(() => {
        if (!results?.layouts || !materialData) return [];

        const summaryMap = new Map<string, {
            materialGrade: string;
            sheet: Sheet;
            totalQuantity: number;
            totalUtilizedWeight: number;
            totalWastageWeight: number;
        }>();

        for (const layout of results.layouts) {
            const sheet = layout.sheet;
            const key = `${sheet.length}x${sheet.width}x${sheet.thickness}x${sheet.grade}`;

            if (summaryMap.has(key)) {
                const entry = summaryMap.get(key)!;
                entry.totalQuantity++;
                entry.totalUtilizedWeight += layout.usedWeight;
                entry.totalWastageWeight += layout.wasteWeight;
            } else {
                summaryMap.set(key, {
                    materialGrade: sheet.grade,
                    sheet: sheet,
                    totalQuantity: 1,
                    totalUtilizedWeight: layout.usedWeight,
                    totalWastageWeight: layout.wasteWeight,
                });
            }
        }

        const summaryArray = Array.from(summaryMap.values()).map(summary => {
            const { sheet, totalQuantity, totalUtilizedWeight, totalWastageWeight, materialGrade } = summary;
            const density = materialData[materialGrade.toUpperCase()]?.density || 7850;
            const individualSheetWeightKg = (sheet.length * sheet.width * sheet.thickness / 1_000_000_000) * density;
            const totalSheetWeight = totalQuantity * individualSheetWeightKg;
            const isCustom = sheet.id.startsWith('custom-');
            
            const displayLength = convertFromBaseUnit(sheet.length, settings.unit).toFixed(0);
            const displayWidth = convertFromBaseUnit(sheet.width, settings.unit).toFixed(0);
            const displayThickness = sheet.thickness;

            const sheetDescription = `${displayLength} × ${displayWidth} × ${displayThickness}`;
            
            return {
                ...summary,
                sheetDescription,
                isCustom,
                totalSheetWeight: totalSheetWeight.toFixed(2),
                utilizedWeight: totalUtilizedWeight.toFixed(2),
                wastageWeight: totalWastageWeight.toFixed(2),
            };
        });
        
        const getSheetSizeRank = (sheet: Sheet) => {
            const { length, width } = sheet;
            if (length === 2500 && width === 1250) return 1;
            if (length === 3000 && width === 1250) return 2;
            if (length === 3000 && width === 1500) return 3;
            if (width === 1250) return 4;
            if (width === 1500) return 5;
            return 6;
        };
        
        summaryArray.sort((a, b) => {
            const sheetA = a.sheet;
            const sheetB = b.sheet;
            const thicknessDiff = sheetA.thickness - sheetB.thickness;
            if (thicknessDiff !== 0) return thicknessDiff;

            const rankA = getSheetSizeRank(sheetA);
            const rankB = getSheetSizeRank(sheetB);
            const rankDiff = rankA - rankB;
            if (rankDiff !== 0) return rankDiff;
            
            const lengthDiff = sheetA.length - sheetB.length;
            if (lengthDiff !== 0) return lengthDiff;

            return sheetA.width - sheetB.width;
        });

        return summaryArray;
    }, [results, materialData, settings.unit]);


    const handleToggleLayoutExpand = (sheetIndex: number) => {
        setExpandedLayouts(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sheetIndex)) newSet.delete(sheetIndex);
            else newSet.add(sheetIndex);
            return newSet;
        });
    };
    
    const formatSheetNumbers = (indices: number[]) => {
        if (!indices || indices.length === 0) return '';
        
        const ranges = [];
        let start = indices[0];
        let end = indices[0];

        for (let i = 1; i < indices.length; i++) {
            if (indices[i] === end + 1) {
            end = indices[i];
            } else {
            ranges.push(start === end ? `${start}` : `${start}-${end}`);
            start = indices[i];
            end = indices[i];
            }
        }
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        return ranges.join(', ');
    };

    const handleExportXLSX = () => {
        if (!results || !sheetSummaryData) return;
    
        // --- UTILITY FUNCTIONS ---
        const getFormattedDateTime = () => {
            const date = new Date();
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const seconds = date.getSeconds().toString().padStart(2, '0');
            return {
                dateStr: `${day}-${month}-${year}`,
                timeStr: `${hours}:${minutes}:${seconds}`
            };
        };
    
        const fitToColumn = (data: any[][]) => {
            const cols = [];
            if (data.length > 0) {
                const maxCols = Math.max(...data.map(row => row ? row.length : 0));
                for (let j = 0; j < maxCols; ++j) {
                    let max_w = 0;
                    for (let i = 0; i < data.length; ++i) {
                        const cellValue = data[i]?.[j];
                        const w = cellValue ? String(cellValue).length : 0;
                        if (w > max_w) max_w = w;
                    }
                    cols.push({ wch: max_w + 4 });
                }
            }
            return cols;
        };
    
        const applyGlobalStyles = (ws: XLSX.WorkSheet) => {
            if(!ws['!ref']) return;
            const range = XLSX.utils.decode_range(ws['!ref']);
            const centerStyle = {
                alignment: { horizontal: 'center' as const, vertical: 'center' as const, wrapText: true },
            };
            for (let R = range.s.r; R <= range.e.r; ++R) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const cell_address = { c: C, r: R };
                    const cell_ref = XLSX.utils.encode_cell(cell_address);
                    if (!ws[cell_ref]) ws[cell_ref] = { t: 'z' }; // Create empty cell if it doesn't exist for styling
                    if (!ws[cell_ref].s) ws[cell_ref].s = {};
                    ws[cell_ref].s = { ...ws[cell_ref].s, ...centerStyle };
                }
            }
        };

        const applyColumnFormats = (ws: XLSX.WorkSheet, formats: { [col: string]: string | ((cell: XLSX.CellObject) => string) }) => {
            if (!ws['!ref']) return;
            const range = XLSX.utils.decode_range(ws['!ref']);
            for (let R = range.s.r; R <= range.e.r; ++R) {
                for (const colLet of Object.keys(formats)) {
                    const C = XLSX.utils.decode_col(colLet);
                    if (C > range.e.c) continue;
        
                    const cell_address = { c: C, r: R };
                    const cell_ref = XLSX.utils.encode_cell(cell_address);
                    const cell = ws[cell_ref];
        
                    if (!cell || cell.t !== 'n') continue;
                    if (!cell.s) cell.s = {};

                    const format = formats[colLet];
                    if (typeof format === 'function') {
                        cell.z = format(cell);
                    } else {
                        cell.z = format;
                    }
                }
            }
        };
    
    
        // --- SHEET 1: Total Sheets Summary ---
        const createSheet1 = () => {
            const header = ["S.No.", "Material Grade", "Sheet Description", "Total Quantity", "Total Sheet Weight (kg)", "Utilized Weight (kg)", "Wastage Weight (kg)"];
            const data = sheetSummaryData.map((row, index) => [
                index + 1,
                row.materialGrade,
                row.sheetDescription,
                row.totalQuantity,
                parseFloat(row.totalSheetWeight),
                parseFloat(row.utilizedWeight),
                parseFloat(row.wastageWeight),
            ]);
    
            const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
            const dataRows = data.length;
            
            const totalRowManualData = [
                "Total", null, null,
                { t: 'n', f: `SUBTOTAL(9,D2:D${dataRows + 1})`, z: '0' },
                { t: 'n', f: `SUBTOTAL(9,E2:E${dataRows + 1})`, z: '0.00' },
                { t: 'n', f: `SUBTOTAL(9,F2:F${dataRows + 1})`, z: '0.00' },
                { t: 'n', f: `SUBTOTAL(9,G2:G${dataRows + 1})`, z: '0.00' },
            ];
            XLSX.utils.sheet_add_aoa(ws, [totalRowManualData], { origin: -1 });
    
            const tableRange = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: header.length - 1, r: dataRows } });
            ws['!table'] = {
                ref: tableRange,
                styleInfo: { name: "TableStyleMedium13", showRowStripes: true },
            };
    
            const columnFormats = {
                'A': '0', // S.No.
                'D': '0', // Total Quantity
                'E': '0.00', // Total Sheet Weight
                'F': '0.00', // Utilized Weight
                'G': '0.00', // Wastage Weight
            };

            ws['!cols'] = fitToColumn([header, ...data, totalRowManualData.map(c => c && typeof c === 'object' ? 'Total' : c)]);
            applyColumnFormats(ws, columnFormats);
            applyGlobalStyles(ws);
            return ws;
        };
    
    
        // --- SHEET 2: Nesting Layout Details ---
        const createSheet2 = () => {
            const header1 = ["Sheet Layout No.", "Material Grade", "Sheet Description", "Sheet Qty", "Utilization Details", null, null, "Wastage Details", null, null, "Parts on this Sheet Details", null, null, null, null];
            const header2 = [null, null, null, null, "%", "kg", "area (m²)", "%", "kg", "area (m²)", "Part S.No.", "Part Name", "Part Length", "Part Width", "Part Qty"];
            const data: any[][] = [header1, header2];
            const merges: XLSX.Range[] = [
                { s: { r: 0, c: 4 }, e: { r: 0, c: 6 } }, { s: { r: 0, c: 7 }, e: { r: 0, c: 9 } }, { s: { r: 0, c: 10 }, e: { r: 0, c: 14 } },
                { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }, { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
            ];
    
            let currentRowIndex = 2;
            groupedLayouts.forEach((group, groupIndex) => {
                const { layout, quantity } = group;
                const sheet = layout.sheet;
                const sheetDescription = `${convertFromBaseUnit(sheet.length, settings.unit).toFixed(0)} × ${convertFromBaseUnit(sheet.width, settings.unit).toFixed(0)} × ${sheet.thickness}`;
    
                const partMap = new Map<number, { originalId: number; name: string; length: number; width: number; quantity: number }>();
                layout.placedParts.forEach(p => {
                    if (partMap.has(p.originalId)) {
                        partMap.get(p.originalId)!.quantity++;
                    } else {
                        partMap.set(p.originalId, { originalId: p.originalId, name: p.name, length: p.length, width: p.width, quantity: 1 });
                    }
                });
                const partsOnSheet = Array.from(partMap.values()).sort((a, b) => a.originalId - b.originalId);
                const numParts = partsOnSheet.length;
                if (numParts === 0) return; // continue in forEach
    
                partsOnSheet.forEach((part, partIndex) => {
                    const rowData = [];
                    if (partIndex === 0) {
                        rowData.push(
                            groupIndex + 1, sheet.grade, sheetDescription, quantity,
                            parseFloat((100 - layout.wastePercentage).toFixed(2)), parseFloat(layout.usedWeight.toFixed(2)), parseFloat((layout.usedArea / 1_000_000).toFixed(2)),
                            parseFloat(layout.wastePercentage.toFixed(2)), parseFloat(layout.wasteWeight.toFixed(2)), parseFloat((layout.wasteArea / 1_000_000).toFixed(2))
                        );
                    } else {
                        rowData.push(...Array(10).fill(null));
                    }
                    rowData.push(
                        part.originalId, part.name,
                        convertFromBaseUnit(part.length, settings.unit),
                        convertFromBaseUnit(part.width, settings.unit),
                        part.quantity
                    );
                    data.push(rowData);
                });
    
                if (numParts > 1) {
                    for (let c = 0; c < 10; c++) {
                        merges.push({ s: { r: currentRowIndex, c }, e: { r: currentRowIndex + numParts - 1, c } });
                    }
                }
                currentRowIndex += numParts;
            });
    
            const dataEndRow = data.length;
            const totalRow = [
                "Total", null, null, { t: 'n', f: `SUBTOTAL(9,D3:D${dataEndRow})` }, // Sheet Qty
                null, { t: 'n', f: `SUBTOTAL(9,F3:F${dataEndRow})` }, { t: 'n', f: `SUBTOTAL(9,G3:G${dataEndRow})` }, // Util
                null, { t: 'n', f: `SUBTOTAL(9,I3:I${dataEndRow})` }, { t: 'n', f: `SUBTOTAL(9,J3:J${dataEndRow})` }, // Waste
                null, null, null, null, { t: 'n', f: `SUBTOTAL(9,O3:O${dataEndRow})` } // Part Qty
            ];
            data.push(totalRow);
    
            const ws = XLSX.utils.aoa_to_sheet(data);
            ws['!merges'] = merges;
            ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: 1, c: header2.length - 1 } }) };
            ws['!cols'] = fitToColumn(data);
    
            const conditionalFormat = (cell: XLSX.CellObject) => {
                if(cell && typeof cell.v === 'number' && Number.isInteger(cell.v)) return '0';
                return '0.00';
            };
            const columnFormats = {
                'D': '0',        // Sheet Qty
                'E': '0.00',     // Util %
                'F': '0.00',     // Util kg
                'G': '0.00',     // Util area
                'H': '0.00',     // Waste %
                'I': '0.00',     // Waste kg
                'J': '0.00',     // Waste area
                'K': '0',        // Part S.No.
                'M': conditionalFormat, // Part Length
                'N': conditionalFormat, // Part Width
                'O': '0',        // Part Qty
            };
            
            // Re-apply formats to total row formulas
            ws[`D${data.length}`].z = '0';
            ws[`F${data.length}`].z = '0.00';
            ws[`G${data.length}`].z = '0.00';
            ws[`I${data.length}`].z = '0.00';
            ws[`J${data.length}`].z = '0.00';
            ws[`O${data.length}`].z = '0';
            
            const tableRange = XLSX.utils.encode_range({ s: { r: 0 }, e: { r: data.length - 2, c: header1.length - 1 } });
            ws['!table'] = { ref: tableRange, styleInfo: { name: "TableStyleMedium13", showRowStripes: true } };
            
            applyColumnFormats(ws, columnFormats);
            applyGlobalStyles(ws);
            return ws;
        };
    
        // --- SHEET 3: Utilization Filter Summary ---
        const createSheet3 = () => {
            const header = ["S.No.", "Material Grade", "Sheet Description", "Sheet Utilization (%)", "Result", "Sheet Qty"];
            const data = groupedLayouts.map((group, index) => {
                const { layout, quantity } = group;
                const { sheet } = layout;
                const sheetDescription = `${convertFromBaseUnit(sheet.length, settings.unit).toFixed(0)} × ${convertFromBaseUnit(sheet.width, settings.unit).toFixed(0)} × ${sheet.thickness}`;
                const utilization = 100 - layout.wastePercentage;
                const density = materialData[sheet.grade.toUpperCase()]?.density || 7850;
                const individualSheetWeightKg = (sheet.length * sheet.width * sheet.thickness / 1_000_000_000) * density;
                const result = utilization >= 80 ? individualSheetWeightKg * quantity : layout.usedWeight; // Note: usedWeight is already for all parts on one sheet
    
                return [ index + 1, sheet.grade, sheetDescription, parseFloat(utilization.toFixed(2)), parseFloat(result.toFixed(2)), quantity ];
            });
    
            const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
            const dataRows = data.length;
            
            const totalRowManualData = [ "Total", null, null, null, { t: 'n', f: `SUBTOTAL(9,E2:E${dataRows + 1})`, z: '0.00' }, { t: 'n', f: `SUBTOTAL(9,F2:F${dataRows + 1})`, z: '0' } ];
            XLSX.utils.sheet_add_aoa(ws, [totalRowManualData], { origin: -1 });
    
            const tableRange = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: header.length - 1, r: dataRows } });
            ws['!table'] = { ref: tableRange, styleInfo: { name: "TableStyleMedium13", showRowStripes: true } };
    
            const columnFormats = {
                'A': '0',      // S.No.
                'D': '0.00',   // Sheet Utilization
                'E': '0.00',   // Result
                'F': '0',      // Sheet Qty
            };

            ws['!cols'] = fitToColumn([header, ...data, totalRowManualData.map(c => c && typeof c === 'object' ? 'Total' : c)]);
            applyColumnFormats(ws, columnFormats);
            applyGlobalStyles(ws);
            return ws;
        };
    
        // --- WORKBOOK CREATION & DOWNLOAD ---
        const { dateStr, timeStr } = getFormattedDateTime();
        const fileName = `Nesting_Summary_${projectName.replace(/\s/g, '_')}_${dateStr}_${timeStr.replace(/:/g, '-')}.xlsx`;
    
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, createSheet1(), "Total Sheets Summary");
        XLSX.utils.book_append_sheet(wb, createSheet2(), "Nesting Layout Details");
        XLSX.utils.book_append_sheet(wb, createSheet3(), "Utilization Filter Summary");
    
        XLSX.writeFile(wb, fileName);
    };
    
    const handleExportPDF = () => {
        if (!results || !groupedLayouts) return;

        // Type definition for jsPDF and autoTable from window
        const { jsPDF } = (window as any).jspdf;
        type jsPDFWithAutoTable = any; // A simple way to type the doc with the plugin
        
        // 1. --- SETUP ---
        const doc: jsPDFWithAutoTable = new jsPDF({
            orientation: 'portrait',
            unit: 'pt',
            format: 'a4'
        });
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const getFormattedDateTime = () => {
            const date = new Date();
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const seconds = date.getSeconds().toString().padStart(2, '0');
            return {
                dateStr: `${day}-${month}-${year}`,
                timeStr: `${hours}:${minutes}:${seconds}`
            };
        };
        const { dateStr, timeStr } = getFormattedDateTime();
        const fileName = `Nesting_Report_${projectName.replace(/\s/g, '_')}_${dateStr}_${timeStr.replace(/:/g, '-')}.pdf`;
        
        // 2. --- LOOP THROUGH LAYOUTS ---
        groupedLayouts.forEach((group, groupIndex) => {
            const { layout, quantity, sheetIndices } = group;

            if (groupIndex > 0) {
                doc.addPage();
            }

            let currentY = 0;

            // --- HEADER ---
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.text(projectName, pageWidth / 2, margin + 5, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(`Exported on: ${dateStr}`, pageWidth - margin, margin, { align: 'right' });
            doc.setDrawColor(200);
            doc.line(margin, margin + 15, pageWidth - margin, margin + 15);
            currentY = margin + 30;

            // --- SHEET LAYOUT INFO TABLE ---
            const layoutInfoHead = [
                [
                    { content: 'Sheet Layout No.', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                    { content: 'Physical Sheet No.', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                    { content: 'Material Grade', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                    { content: 'Sheet Description (L×W×T)', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                    { content: 'Utilization', colSpan: 3, styles: { halign: 'center' } },
                    { content: 'Wastage', colSpan: 3, styles: { halign: 'center' } },
                    { content: 'Sheet Qty', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                ],
                [
                    { content: '%', styles: { halign: 'center' } },
                    { content: 'kg', styles: { halign: 'center' } },
                    { content: 'm²', styles: { halign: 'center' } },
                    { content: '%', styles: { halign: 'center' } },
                    { content: 'kg', styles: { halign: 'center' } },
                    { content: 'm²', styles: { halign: 'center' } }
                ]
            ];

            const layoutInfoBody = [
                [
                    groupIndex + 1,
                    formatSheetNumbers(sheetIndices),
                    layout.sheet.grade,
                    `${convertFromBaseUnit(layout.sheet.length, settings.unit).toFixed(0)} × ${convertFromBaseUnit(layout.sheet.width, settings.unit).toFixed(0)} × ${layout.sheet.thickness}`,
                    (100 - layout.wastePercentage).toFixed(2),
                    layout.usedWeight.toFixed(2),
                    (layout.usedArea / 1_000_000).toFixed(2),
                    layout.wastePercentage.toFixed(2),
                    layout.wasteWeight.toFixed(2),
                    (layout.wasteArea / 1_000_000).toFixed(2),
                    quantity,
                ]
            ];

            doc.autoTable({
                head: layoutInfoHead,
                body: layoutInfoBody,
                startY: currentY,
                theme: 'grid',
                headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' },
                styles: { halign: 'center', valign: 'middle', font: 'helvetica', fontSize: 9 },
                margin: { left: margin, right: margin }
            });

            currentY = doc.autoTable.previous.finalY + 20;

            // --- NESTED SHEET LAYOUT VISUAL ---
            const svgContainerWidth = contentWidth * (3/4);
            const svgAspectRatio = layout.sheet.width / layout.sheet.length;
            const svgContainerHeight = svgContainerWidth * svgAspectRatio;
            const svgX = margin + (contentWidth - svgContainerWidth) / 2; // Center the SVG
            
            // Scale factors
            const scaleX = svgContainerWidth / layout.sheet.length;
            const scaleY = svgContainerHeight / layout.sheet.width;
            
            // Draw sheet boundary
            doc.setDrawColor(150);
            doc.setFillColor(245, 245, 245);
            doc.rect(svgX, currentY, svgContainerWidth, svgContainerHeight, 'FD');

            // Draw parts
            const colorScale = [ '#a8dadc', '#457b9d', '#1d3557', '#e63946', '#f1faee', '#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff' ];
            doc.setDrawColor(20); // Part border color
            doc.setLineWidth(0.5);
            
            layout.placedParts.forEach(part => {
                const partWidth = part.rotated ? part.length : part.width;
                const partHeight = part.rotated ? part.width : part.length;
                
                const rectX = svgX + (part.x * scaleX);
                const rectY = currentY + (part.y * scaleY);
                const rectW = partWidth * scaleX;
                const rectH = partHeight * scaleY;
                
                const color = colorScale[part.originalId % colorScale.length];
                doc.setFillColor(color);
                doc.rect(rectX, rectY, rectW, rectH, 'FD');
                
                // Draw part label
                const fontSize = Math.min(rectW, rectH) / 2.5;
                if (fontSize > 4) { // Only draw if text is somewhat legible
                    doc.setFontSize(fontSize);
                    doc.setTextColor(0, 0, 0);
                    doc.setFont('helvetica', 'bold');
                    doc.text(`P${part.originalId}`, rectX + rectW / 2, rectY + rectH / 2, { align: 'center', baseline: 'middle' });
                }
            });

            currentY += svgContainerHeight + 20;

            // --- PARTS ON THIS SHEET TABLE ---
            const partsOnSheetMap = new Map<number, PlacedPart & { quantity: number }>();
            layout.placedParts.forEach(part => {
                if (!partsOnSheetMap.has(part.originalId)) {
                    partsOnSheetMap.set(part.originalId, { ...part, quantity: 0 });
                }
                partsOnSheetMap.get(part.originalId)!.quantity++;
            });
            const partsOnSheet = Array.from(partsOnSheetMap.values()).sort((a,b) => a.originalId - b.originalId);

            const partsTableHead = [['Part S.No.', 'Part Name', `Part Length (${settings.unit})`, `Part Width (${settings.unit})`, 'Part Qty']];
            const partsTableBody = partsOnSheet.map(p => [
                p.originalId,
                p.name,
                convertFromBaseUnit(p.length, settings.unit).toFixed(1),
                convertFromBaseUnit(p.width, settings.unit).toFixed(1),
                p.quantity
            ]);

            doc.autoTable({
                head: partsTableHead,
                body: partsTableBody,
                startY: currentY,
                theme: 'grid',
                headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' },
                styles: { halign: 'center', valign: 'middle', font: 'helvetica', fontSize: 10 },
                margin: { left: margin, right: margin }
            });
        });

        // 3. --- FOOTERS & PAGINATION ---
        const pageCount = doc.internal.getNumberOfPages();
        const pageHeight = doc.internal.pageSize.getHeight();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text('Generated by NESTINGAI', margin, pageHeight - 15, { align: 'left' });
            
            doc.setFont('helvetica', 'normal');
            doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 15, { align: 'right' });
        }
        
        // 4. --- SAVE DOCUMENT ---
        doc.save(fileName);
    };


    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Panel: Sheet Definitions */}
                <div className="lg:col-span-3">
                    <Card title="📐 Sheet Definitions" className="sticky top-24">
                        {renderRadioGroup("Mode", ['Automatic', 'Manual'], sheetMode === 'automatic' ? 'Automatic' : 'Manual', (v) => setSheetMode(v.toLowerCase() as 'manual' | 'automatic'))}
                        <div className="mt-4">
                          {sheetMode === 'manual' ? (
                              <ManualSheetEditor
                                manualSheets={manualSheets}
                                unit={settings.unit}
                                sheetForecaster={sheetForecaster}
                                uniqueThicknesses={uniqueThicknesses}
                                uniqueGrades={uniqueGrades}
                                materialData={materialData}
                                onSheetChange={handleManualSheetChange}
                                onAddSheet={handleAddManualSheet}
                                onRemoveSheet={handleRemoveManualSheet}
                                onDuplicateSheet={handleDuplicateManualSheet}
                                onToggleForecaster={setSheetForecaster}
                              />
                          ) : (
                              <div>
                                  <div className="text-center text-sm text-[color:var(--color-text-muted)] p-4 bg-[color:var(--color-surface)] rounded-md border border-[color:var(--color-border)]">
                                      Sheet sizes are determined automatically to minimize waste based on the parts list and material rules.
                                  </div>
                                  {renderCustomizationConfig()}
                              </div>
                          )}
                        </div>
                    </Card>
                </div>

                {/* Center Panel: Parts Input */}
                <div className="lg:col-span-6">
                     <Card title={
                        <div className="flex justify-between items-center w-full">
                            <span className="text-lg font-display font-bold">🧾 Parts Input</span>
                            <div>
                                {isEditingProjectName ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={tempProjectName}
                                            onChange={(e) => setTempProjectName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleProjectNameSave();
                                                if (e.key === 'Escape') setIsEditingProjectName(false);
                                            }}
                                            className="px-2 py-0.5 text-base font-semibold border-b border-[color:var(--color-primary)] bg-transparent focus:outline-none text-center"
                                            autoFocus
                                        />
                                        <button onClick={handleProjectNameSave} className="p-1 rounded-md text-green-500 hover:bg-green-500/10" title="Save name">
                                            <CheckIcon />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 group">
                                        <span className="font-semibold text-[color:var(--color-text)] text-lg">Project: {projectName}</span>
                                        <button onClick={handleEditClick} className="p-1 rounded-md hover:bg-[color:var(--color-surface)] opacity-0 group-hover:opacity-100 transition-opacity" title="Edit project name">
                                            <EditIcon />
                                        </button>
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex space-x-1 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] p-1 rounded-lg">
                                <button onClick={() => setInputMode('input')} className={`text-center text-xs px-3 py-1 rounded-md transition-colors font-medium ${inputMode === 'input' ? 'bg-[color:color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[color:var(--color-primary)] shadow-sm' : 'text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg)]'}`}>
                                    Input Mode
                                </button>
                                <button onClick={() => setInputMode('table')} className={`text-center text-xs px-3 py-1 rounded-md transition-colors font-medium ${inputMode === 'table' ? 'bg-[color:color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[color:var(--color-primary)] shadow-sm' : 'text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg)]'}`}>
                                    Preview Table
                                </button>
                            </div>
                        </div>
                    }>
                         {inputMode === 'input' ? (
                            <>
                                <div className="flex space-x-2 mb-4">
                                    {renderTextarea('names', 'Part Name')}
                                    {renderTextarea('lengths', 'Length')}
                                    {renderTextarea('widths', 'Width')}
                                    {renderTextarea('thicknesses', 'Thickness')}
                                    {renderTextarea('grades', 'Material')}
                                    {renderTextarea('quantities', 'Quantity')}
                                </div>
                                <div className="flex space-x-2">
                                   <button onClick={handlePasteCsv} className="text-sm font-medium text-[color:var(--color-primary)] hover:text-[color:var(--color-text)] p-2 rounded-md bg-[color:color-mix(in_srgb,var(--color-primary)_10%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--color-primary)_20%,transparent)] w-full transition">📤 Paste CSV / TSV</button>
                                   <button onClick={handleSample} className="text-sm font-medium text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] p-2 rounded-md bg-[color:var(--color-surface)] hover:bg-[color:var(--color-bg)] w-full transition">🧩 Sample</button>
                                   <button onClick={handleClear} className="text-sm font-medium text-red-400 hover:text-red-300 p-2 rounded-md bg-red-500/10 hover:bg-red-500/20 w-full transition">🧹 Clear</button>
                                </div>
                             </>
                        ) : (
                            renderPreviewTable()
                        )}
                    </Card>
                </div>
                
                {/* Right Panel: Settings */}
                <div className="lg:col-span-3">
                     <div className="sticky top-24 space-y-6">
                        <Card title="⚙️ Nesting Settings" className="space-y-4">
                             <InputField label={`Part-to-Part Clearance (${settings.unit})`} value={settings.partToPart} onChange={e => handleSettingsChange('partToPart', parseFloat(e.target.value))} />
                             <InputField label={`Edge Clearance (${settings.unit})`} value={settings.partToSheet} onChange={e => handleSettingsChange('partToSheet', parseFloat(e.target.value))} />
                             {renderRadioGroup("Rotation Settings", Object.values(RotationOption), settings.rotation, (v) => handleSettingsChange('rotation', v as RotationOption))}
                             {renderRadioGroup("Optimization Goal", Object.values(OptimizationGoal), settings.optimizationGoal, (v) => handleSettingsChange('optimizationGoal', v as OptimizationGoal))}
                            <button onClick={handleNest} disabled={loading || consolidatedParts.length === 0} className="w-full btn-primary font-bold py-3 px-4 rounded-lg transition-all text-base flex items-center justify-center gap-2">
                                {loading ? <><Spinner /> Optimizing...</> : '🟢 Start Nesting Optimization'}
                            </button>
                        </Card>
                    </div>
                </div>
            </div>
            
            {(errors.length > 0 && !loading) && <div className="bg-red-500/20 border-l-4 border-red-500 text-red-300 p-4 rounded-md fade-in" role="alert"><p className="font-bold">Errors Found in Parts Input</p><ul className="list-disc pl-5 mt-2 text-sm">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
            
            {results && (
                <div className="space-y-6 mt-6 fade-in">
                     <Card title="📊 Processing Summary">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            <div className="summary-box summary-box-util">
                                <div className="summary-box-label">Sheet Utilization</div>
                                <div className="summary-box-value">{results.totalSheetArea > 0 ? ((results.totalUsedArea / results.totalSheetArea) * 100).toFixed(2) : 0}%</div>
                            </div>
                            <div className="summary-box summary-box-used">
                                <div className="summary-box-label">Utilized Weight</div>
                                <div className="summary-box-value">{results.totalUsedWeight.toFixed(2)} kg</div>
                            </div>
                            <div className="summary-box summary-box-waste">
                                <div className="summary-box-label">Wastage %</div>
                                <div className="summary-box-value">{results.totalWastePercentage.toFixed(2)}%</div>
                            </div>
                            <div className="summary-box summary-box-waste">
                                <div className="summary-box-label">Wastage Weight</div>
                                <div className="summary-box-value">{results.totalWasteWeight.toFixed(2)} kg</div>
                            </div>
                            <div className="summary-box summary-box-neutral">
                                <div className="summary-box-label">Sheets Used</div>
                                <div className="summary-box-value">{Object.values(results.totalSheetsUsed).reduce((a: number, b: number) => a + b, 0)}</div>
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-[color:var(--color-border)] text-sm grid grid-cols-2 md:grid-cols-3 gap-2 text-[color:var(--color-text-muted)]">
                           <p><span className="font-semibold text-[color:var(--color-text)]">Goal:</span> {settings.optimizationGoal}</p>
                           <p><span className="font-semibold text-[color:var(--color-text)]">Part-Part Clearance:</span> {settings.partToPart} {settings.unit}</p>
                           <p><span className="font-semibold text-[color:var(--color-text)]">Edge Clearance:</span> {settings.partToSheet} {settings.unit}</p>
                        </div>
                    </Card>

                    <div>
                      <h2 className="text-3xl font-bold font-display text-[color:var(--color-text)] mb-6">🧩 Nesting Results Visualization</h2>
                       {results.unplacedParts.length > 0 && 
                          <Card className="mb-6 bg-yellow-500/10 border-yellow-400/50">
                              <h4 className="font-semibold text-yellow-300">Unplaced Parts:</h4>
                              <ul className="list-disc pl-5 text-sm text-yellow-400">
                                  {results.unplacedParts.map(p => <li key={p.id}>P{p.originalId} ({p.name}) - Qty: {p.quantity}</li>)}
                              </ul>
                          </Card>
                       }
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {groupedLayouts.map(({ layout, quantity, sheetIndices }, index) => {
                              const isCustomSheet = layout.sheet.id.startsWith('custom-');
                              const firstSheetIndex = sheetIndices[0] || layout.sheetIndex;
                              
                              return (
                              <Card key={firstSheetIndex}>
                                  <div className="flex justify-between items-center mb-2">
                                      <h4 className="font-semibold text-lg text-[color:var(--color-text)]">Sheet Layout #{index + 1}</h4>
                                      <div className="flex items-center space-x-2">
                                          <div className="bg-[color:var(--color-primary)] text-[color:var(--color-text-inv)] text-xs font-bold px-2 py-1 rounded-full">Qty: {quantity}</div>
                                          <button onClick={() => handleToggleLayoutExpand(firstSheetIndex)} className="p-1 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface)] rounded-md">
                                              <ChevronDownIcon className={`${expandedLayouts.has(firstSheetIndex) ? 'rotate-180' : ''}`} />
                                          </button>
                                      </div>
                                  </div>
                                  <p className="text-xs text-[color:var(--color-text-muted)] opacity-70 -mt-1 mb-2">Physical Sheet(s): #{formatSheetNumbers(sheetIndices)}</p>
                                  <div className="flex items-center space-x-3 mb-2">
                                    <p className="text-sm text-[color:var(--color-text-muted)]">
                                      Type: {convertFromBaseUnit(layout.sheet.length, settings.unit)}x{convertFromBaseUnit(layout.sheet.width, settings.unit)}x{layout.sheet.thickness} {settings.unit}
                                    </p>
                                     <p className="text-sm text-[color:var(--color-text-muted)] font-semibold">
                                        Grade: {layout.sheet.grade}
                                    </p>
                                    {isCustomSheet && <span className="tag-custom">Customized</span>}
                                  </div>
                                  <SheetLayoutSVG layout={layout} />
                                  <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
                                      <div className="flex justify-between items-center">
                                          <h5 className="font-semibold text-green-400">Utilization</h5>
                                          <p className="font-mono text-[color:var(--color-text)]">
                                            {(100 - layout.wastePercentage).toFixed(2)}% / {layout.usedWeight.toFixed(2)} kg / {(layout.usedArea / 1_000_000).toFixed(2)} m²
                                          </p>
                                      </div>
                                       <div className="flex justify-between items-center">
                                          <h5 className="font-semibold text-red-400">Wastage</h5>
                                          <p className="font-mono text-[color:var(--color-text)]">
                                            {layout.wastePercentage.toFixed(2)}% / {layout.wasteWeight.toFixed(2)} kg / {(layout.wasteArea / 1_000_000).toFixed(2)} m²
                                          </p>
                                      </div>
                                  </div>
                                  <div className={`transition-[grid-template-rows] duration-500 ease-in-out grid ${expandedLayouts.has(firstSheetIndex) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                    <div className="overflow-hidden">
                                        <PlacedPartsTable layout={layout} unit={settings.unit} />
                                    </div>
                                  </div>
                              </Card>
                          )})}
                      </div>
                   </div>
                    {sheetSummaryData.length > 0 && (
                        <div className="mt-8">
                            <h2 className="text-3xl font-bold font-display text-[color:var(--color-text)] mb-6">📋 Total Sheets Summary</h2>
                            <Card className="w-full">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-[color:var(--color-bg)]">
                                            <tr className="border-b border-[color:var(--color-border)]">
                                                <th className="p-3 font-semibold text-[color:var(--color-text-muted)]">S.No.</th>
                                                <th className="p-3 font-semibold text-[color:var(--color-text-muted)]">Material Grade</th>
                                                <th className="p-3 font-semibold text-[color:var(--color-text-muted)]">Sheet Description</th>
                                                <th className="p-3 font-semibold text-[color:var(--color-text-muted)] text-center">Total Qty</th>
                                                <th className="p-3 font-semibold text-[color:var(--color-text-muted)] text-right">Total Sheet Weight (kg)</th>
                                                <th className="p-3 font-semibold text-[color:var(--color-text-muted)] text-right">Utilized Weight (kg)</th>
                                                <th className="p-3 font-semibold text-[color:var(--color-text-muted)] text-right">Wastage Weight (kg)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[color:var(--color-border)]">
                                            {sheetSummaryData.map((row, index) => (
                                                <tr key={index} className="hover:bg-[color:var(--color-input-bg)] transition-colors">
                                                    <td className="p-3 text-[color:var(--color-text-muted)]">{index + 1}</td>
                                                    <td className="p-3 font-medium">{row.materialGrade}</td>
                                                    <td className="p-3">
                                                        {row.sheetDescription}
                                                        {row.isCustom && <span className="ml-2 tag-custom">Customized</span>}
                                                    </td>
                                                    <td className="p-3 text-center font-medium">{row.totalQuantity}</td>
                                                    <td className="p-3 text-right font-mono">{row.totalSheetWeight}</td>
                                                    <td className="p-3 text-right font-mono">{row.utilizedWeight}</td>
                                                    <td className="p-3 text-right font-mono">{row.wastageWeight}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        </div>
                    )}
                    <div className="mt-8 flex items-center justify-center space-x-4">
                        <button
                            onClick={handleExportXLSX}
                            className="flex items-center justify-center px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors shadow-lg shadow-green-600/20 disabled:bg-slate-600"
                            disabled={!results}
                        >
                            📤 Export Data (xlsx)
                        </button>
                        <button
                            onClick={handleExportPDF}
                            className="flex items-center justify-center px-6 py-3 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20 disabled:bg-slate-600"
                            disabled={!results}
                        >
                            📤 Export Data (PDF)
                        </button>
                        <button
                            onClick={handleAddOutputData}
                            className="flex items-center justify-center px-6 py-3 bg-[color:var(--color-accent)] text-white font-semibold rounded-lg hover:bg-[color:var(--color-primary)] transition-colors shadow-lg shadow-blue-500/20 disabled:bg-slate-600"
                            disabled={!results}
                        >
                            📤 Add Output Data
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Linear Nesting Page ---
const StockLayoutBar: React.FC<{ layout: StockLayout; unit: Unit; leftAllowanceBase: number; rightAllowanceBase: number; }> = ({ layout, unit, leftAllowanceBase, rightAllowanceBase }) => {
    // The total waste for this bar is already calculated as layout.wasteLength = layout.stockLength - layout.usedLength.
    // This includes allowances and internal offcuts. We need to separate them for visualization.
    const internalWasteLength = Math.max(0, layout.wasteLength - leftAllowanceBase - rightAllowanceBase);

    return (
        <div
            className="w-full bg-[color:var(--color-input-bg)] rounded-full h-8 my-2 flex overflow-hidden border border-[color:var(--color-border)]"
            title={`Total Stock Length: ${convertFromBaseUnit(layout.stockLength, unit).toFixed(0)} ${unit}`}
        >
            {/* Left Allowance */}
            {leftAllowanceBase > 0 && (
                <div
                    style={{ width: `${(leftAllowanceBase / layout.stockLength) * 100}%` }}
                    className="bg-yellow-800/50 h-full flex items-center justify-center text-xs font-mono text-yellow-300"
                    title={`Start Allowance: ${convertFromBaseUnit(leftAllowanceBase, unit).toFixed(1)} ${unit}`}
                >
                    L
                </div>
            )}

            {/* Cuts */}
            {layout.cuts.map((cut, index) => (
                <div
                    key={index}
                    style={{ width: `${(cut.effectiveLength / layout.stockLength) * 100}%` }}
                    className="bg-gradient-to-r from-[color:var(--color-primary)] to-[color:var(--color-accent)] h-full border-x border-[color:var(--color-bg)] border-opacity-50 flex items-center justify-center text-[color:var(--color-text-inv)] text-xs font-mono"
                    title={`Part: ${convertFromBaseUnit(cut.length, unit).toFixed(0)} ${unit} (+ ${convertFromBaseUnit(cut.effectiveLength - cut.length, unit).toFixed(1)} ${unit} kerf)`}
                >
                    {convertFromBaseUnit(cut.length, unit).toFixed(0)}
                </div>
            ))}

            {/* Internal Waste (Offcut) */}
            {internalWasteLength > 1e-6 && ( // Use a small epsilon to avoid rendering tiny slivers
                 <div
                    style={{ width: `${(internalWasteLength / layout.stockLength) * 100}%` }}
                    className="bg-red-800/50 h-full"
                    title={`Internal Waste: ${convertFromBaseUnit(internalWasteLength, unit).toFixed(1)} ${unit}`}
                ></div>
            )}

            {/* Right Allowance */}
            {rightAllowanceBase > 0 && (
                <div
                    style={{ width: `${(rightAllowanceBase / layout.stockLength) * 100}%` }}
                    className="bg-yellow-800/50 h-full flex items-center justify-center text-xs font-mono text-yellow-300"
                    title={`End Allowance: ${convertFromBaseUnit(rightAllowanceBase, unit).toFixed(1)} ${unit}`}
                >
                    R
                </div>
            )}
        </div>
    );
};


const LinearNestingPage: React.FC = () => {
    const [partsUnit, setPartsUnit] = useState<Unit>(Unit.MM);
    const [stockUnit, setStockUnit] = useState<Unit>(Unit.M);
    const [stockLength, setStockLength] = useState(6);
    const [kerf, setKerf] = useState(5); // Renamed from allowance for clarity
    const [leftEndAllowance, setLeftEndAllowance] = useState(10);
    const [rightEndAllowance, setRightEndAllowance] = useState(10);
    const [allowanceUnit, setAllowanceUnit] = useState<Unit>(Unit.MM);
    const [optimizationGoal, setOptimizationGoal] = useState<OptimizationGoal>(OptimizationGoal.PRIORITIZE_SPEED);
    const [partsCsv, setPartsCsv] = useState('');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [results, setResults] = useState<LinearNestingResult | null>(null);
    const [isCopied, setIsCopied] = useState(false);
    
    const { addLinearOutput } = useOutputData();
    const navigate = useNavigate();

    useEffect(() => {
        if (stockUnit === Unit.M) {
            setStockLength(6);
        } else if (stockUnit === Unit.MM) {
            setStockLength(6000);
        }
    }, [stockUnit]);

    const handleNest = async () => {
        setLoading(true); setResults(null); setErrors([]);
        const kerfBase = convertToBaseUnit(kerf, allowanceUnit);
        const { parts, errors: parseErrors } = parseLinearParts(partsCsv, kerfBase);
        if (parseErrors.length > 0) {
            setErrors(parseErrors); setLoading(false); return;
        }
        const stockLengthBase = convertToBaseUnit(stockLength, stockUnit);
        const leftEndAllowanceBase = convertToBaseUnit(leftEndAllowance, allowanceUnit);
        const rightEndAllowanceBase = convertToBaseUnit(rightEndAllowance, allowanceUnit);
        const partsInBaseUnit = parts.map(p => ({ ...p, length: convertToBaseUnit(p.length, partsUnit), effectiveLength: convertToBaseUnit(p.length, partsUnit) + kerfBase }));
        
        try {
            setTimeout(() => {
                const nestResults = performLinearNesting(stockLengthBase, partsInBaseUnit, optimizationGoal, leftEndAllowanceBase, rightEndAllowanceBase);
                setResults(nestResults);
                setLoading(false);
            }, 50);
        } catch (error) {
            console.error("Linear Nesting Error:", error);
            setErrors(["An unexpected error occurred during the nesting calculation."]);
            setLoading(false);
        }
    };

    const loadDemoData = () => {
        const demoDataMm = "MS,1994,2\nMS,1902,2\nSS,2064,1\nMS,1925,7\nSS,2667,1\nMS,2342,5\nMS,1277,1\nSS,1344,1\nMS,1638,2\nMS,2400,1\nSS,105,10";
        const demoDataM = "MS,1.994,2\nMS,1.902,2\nSS,2.064,1\nMS,1.925,7\nSS,2.667,1\nMS,2.342,5\nMS,1.277,1\nSS,1.344,1\nMS,1.638,2\nMS,2.400,1\nSS,0.105,10";
        
        if (partsUnit === Unit.MM) {
            setPartsCsv(demoDataMm);
        } else {
            setPartsCsv(demoDataM);
        }
        setResults(null);
        setErrors([]);
    };

    const handleClearParts = () => setPartsCsv('');

    const handlePasteParts = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setPartsCsv(text);
        } catch (err) {
            console.error('Failed to paste from clipboard:', err);
            alert('Could not paste from clipboard. Please ensure you have given permission.');
        }
    };

    const groupedLayouts = useMemo(() => {
        if (!results?.layouts) return [];

        const layoutMap = new Map<string, { layout: StockLayout; quantity: number; stockIndices: number[] }>();

        for (const layout of results.layouts) {
            const cutsKey = layout.cuts
                .map(c => c.effectiveLength)
                .sort((a, b) => a - b)
                .join(',');
            
            const groupKey = `${layout.rawMaterial}|${cutsKey}`;

            if (layoutMap.has(groupKey)) {
                const entry = layoutMap.get(groupKey)!;
                entry.quantity++;
                entry.stockIndices.push(layout.stockIndex);
            } else {
                layoutMap.set(groupKey, {
                    layout,
                    quantity: 1,
                    stockIndices: [layout.stockIndex],
                });
            }
        }
        
        const grouped = Array.from(layoutMap.values());
        
        for (const entry of grouped) {
            entry.stockIndices.sort((a, b) => a - b);
        }
        
        // Sort by material, then by waste
        grouped.sort((a, b) => {
            if (a.layout.rawMaterial.toLowerCase() < b.layout.rawMaterial.toLowerCase()) return -1;
            if (a.layout.rawMaterial.toLowerCase() > b.layout.rawMaterial.toLowerCase()) return 1;
            return a.layout.wastePercentage - b.layout.wastePercentage;
        });


        return grouped;
    }, [results]);

    const formatNumberRanges = (indices: number[]) => {
        if (!indices || indices.length === 0) return '';
        
        const ranges = [];
        let start = indices[0];
        let end = indices[0];

        for (let i = 1; i < indices.length; i++) {
            if (indices[i] === end + 1) {
                end = indices[i];
            } else {
                ranges.push(start === end ? `${start}` : `${start}-${end}`);
                start = indices[i];
                end = indices[i];
            }
        }
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        return ranges.join(', ');
    };

    const summaryMetrics = useMemo(() => {
        if (!results) {
            return null;
        }
        const stockLengthBase = convertToBaseUnit(stockLength, stockUnit);
        const totalStockLength = results.totalStockUsed * stockLengthBase;
        const totalUsedLength = totalStockLength - results.totalWaste;
        const utilizationPercentage = totalStockLength > 0 ? (totalUsedLength / totalStockLength) * 100 : 0;
    
        return {
            totalStockUsed: results.totalStockUsed,
            totalWaste: convertFromBaseUnit(results.totalWaste, partsUnit).toFixed(2),
            totalWastePercentage: results.totalWastePercentage.toFixed(2),
            utilizationPercentage: utilizationPercentage.toFixed(2),
            usedLength: convertFromBaseUnit(totalUsedLength, partsUnit).toFixed(2),
        };
    }, [results, stockLength, stockUnit, partsUnit]);

    const stockSummaryData = useMemo(() => {
        if (!results) return [];

        const summaryMap = new Map<string, { stocksUsed: number; totalUsedLength: number; totalWastageLength: number; }>();
        for (const layout of results.layouts) {
            const entry = summaryMap.get(layout.rawMaterial) || { stocksUsed: 0, totalUsedLength: 0, totalWastageLength: 0 };
            entry.stocksUsed++;
            entry.totalUsedLength += layout.usedLength;
            entry.totalWastageLength += layout.wasteLength;
            summaryMap.set(layout.rawMaterial, entry);
        }
        
        const stockLengthInMeters = convertFromBaseUnit(convertToBaseUnit(stockLength, stockUnit), Unit.M);
    
        const summaryArray = Array.from(summaryMap.entries()).map(([rawMaterial, data]) => ({
            rawMaterial,
            stockUsedInLength: (data.stocksUsed * stockLengthInMeters).toFixed(2),
            stockQuantity: data.stocksUsed,
            utilizedLength: convertFromBaseUnit(data.totalUsedLength, partsUnit).toFixed(2),
            wastageLength: convertFromBaseUnit(data.totalWastageLength, partsUnit).toFixed(2),
        }));
    
        summaryArray.sort((a, b) => a.rawMaterial.localeCompare(b.rawMaterial));
    
        return summaryArray;
    }, [results, stockLength, stockUnit, partsUnit]);

    const handleCopyStockSummary = () => {
        const textToCopy = [
            ['Raw Material', 'Stock Used in Length (m)', 'Stock Quantity', `Utilized Length (${partsUnit})`, `Wastage Length (${partsUnit})`].join('\t'),
            ...stockSummaryData.map(row => [
                row.rawMaterial,
                row.stockUsedInLength,
                row.stockQuantity,
                row.utilizedLength,
                row.wastageLength
            ].join('\t'))
        ].join('\n');
    
        navigator.clipboard.writeText(textToCopy).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            alert('Could not copy table to clipboard.');
        });
    };

    const handleAddOutputData = () => {
        if (stockSummaryData.length === 0) return;
        const newData = stockSummaryData.map(row => ({
            id: `linear-${row.rawMaterial}`,
            type: 'linear' as const,
            description: row.rawMaterial,
            lengthMtr: row.stockUsedInLength,
            weightKg: '',
            remarks: ''
        }));
        addLinearOutput(newData);
        navigate('/output-data');
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="grid lg:grid-cols-12 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-9 space-y-6">
                    <Card title="Parts Input">
                        <div className="flex justify-between items-center mb-2">
                             <p className="text-sm text-[color:var(--color-text-muted)]">Enter parts one per line: <code className="bg-[color:var(--color-bg)] p-1 rounded">raw material, length, quantity</code></p>
                             <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-2">
                                    <label className="text-sm font-medium text-[color:var(--color-text)]">Units:</label>
                                    <select value={partsUnit} onChange={e => setPartsUnit(e.target.value as Unit)} className="input-field p-1 rounded-md text-sm">
                                        <option value={Unit.MM}>mm</option>
                                        <option value={Unit.M}>m</option>
                                    </select>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <button onClick={handlePasteParts} title="Paste CSV/TSV" className="p-1.5 text-[color:var(--color-text-muted)] hover:text-[color:var(--color-primary)] hover:bg-[color:var(--color-surface)] rounded-md"><ClipboardIcon /></button>
                                    <button onClick={handleClearParts} title="Clear Input" className="p-1.5 text-[color:var(--color-text-muted)] hover:text-red-500 hover:bg-[color:var(--color-surface)] rounded-md"><TrashIcon /></button>
                                </div>
                             </div>
                        </div>
                         <textarea value={partsCsv} onChange={e => setPartsCsv(e.target.value)} rows={10} placeholder={"Example:\nMS, 1994, 2\nSS, 1902, 2"} className="input-field p-2 rounded-md w-full font-mono text-sm"></textarea>
                    </Card>
                </div>

                {/* Settings Sidebar */}
                <div className="lg:col-span-3">
                    <Card title="Stock &amp; Settings" className="space-y-4 sticky top-24">
                        {renderRadioGroup("Optimization Goal", Object.values(OptimizationGoal), optimizationGoal, (v) => setOptimizationGoal(v as OptimizationGoal))}
                         <div>
                            <label className="block text-sm font-medium text-[color:var(--color-text)] mb-1">Standard Stock Length</label>
                            <div className="flex items-center space-x-2">
                                <input type="number" value={stockLength} onChange={e => setStockLength(parseFloat(e.target.value))} className="input-field p-2 rounded-md w-full" />
                                <select value={stockUnit} onChange={e => setStockUnit(e.target.value as Unit)} className="input-field p-2 rounded-md"><option value={Unit.M}>m</option><option value={Unit.MM}>mm</option></select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[color:var(--color-text)] mb-1">Cutting Allowance (Kerf)</label>
                            <div className="flex items-center space-x-2">
                                <input type="number" value={kerf} onChange={e => setKerf(parseFloat(e.target.value))} className="input-field p-2 rounded-md w-full" />
                                <select value={allowanceUnit} onChange={e => setAllowanceUnit(e.target.value as Unit)} className="input-field p-2 rounded-md"><option value={Unit.MM}>mm</option><option value={Unit.INCH}>inch</option></select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[color:var(--color-text)] mb-1">Start & End Allowances ({allowanceUnit})</label>
                             <div className="flex items-center space-x-2">
                                <input type="number" value={leftEndAllowance} onChange={e => setLeftEndAllowance(parseFloat(e.target.value))} className="input-field p-2 rounded-md w-full" placeholder="Left" />
                                <input type="number" value={rightEndAllowance} onChange={e => setRightEndAllowance(parseFloat(e.target.value))} className="input-field p-2 rounded-md w-full" placeholder="Right"/>
                            </div>
                        </div>
                        <div className="pt-4 space-y-2">
                            <button onClick={handleNest} disabled={loading} className="w-full btn-primary font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2">{loading ? <><Spinner />Optimizing...</> : 'Start Nesting Optimization'}</button>
                            <button onClick={loadDemoData} className="w-full bg-[color:var(--color-surface)] text-[color:var(--color-text)] font-bold py-2 px-4 rounded-lg hover:bg-[color:var(--color-bg)] transition-colors">Load Demo</button>
                        </div>
                    </Card>
                </div>
            </div>
            
            {errors.length > 0 && <div className="bg-red-500/20 border-l-4 border-red-500 text-red-300 p-4 rounded-md fade-in" role="alert"><p className="font-bold">Errors Found</p><ul className="list-disc pl-5 mt-2 text-sm">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
            
            {results && summaryMetrics && (
                <div className="mt-8 space-y-6 fade-in">
                    <h2 className="text-3xl font-bold font-display">Nesting Results</h2>
                    <Card title="📊 Processing Summary">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            <div className="summary-box summary-box-util">
                                <div className="summary-box-label">Stock Utilization</div>
                                <div className="summary-box-value">{summaryMetrics.utilizationPercentage}%</div>
                            </div>
                            <div className="summary-box summary-box-used">
                                <div className="summary-box-label">Used Length</div>
                                <div className="summary-box-value">{summaryMetrics.usedLength} {partsUnit}</div>
                            </div>
                            <div className="summary-box summary-box-waste">
                                <div className="summary-box-label">Wastage %</div>
                                <div className="summary-box-value">{summaryMetrics.totalWastePercentage}%</div>
                            </div>
                            <div className="summary-box summary-box-waste">
                                <div className="summary-box-label">Wastage Length</div>
                                <div className="summary-box-value">{summaryMetrics.totalWaste} {partsUnit}</div>
                            </div>
                            <div className="summary-box summary-box-neutral">
                                <div className="summary-box-label">Stocks Used</div>
                                <div className="summary-box-value">{summaryMetrics.totalStockUsed}</div>
                            </div>
                        </div>
                        {results.unplacedParts.length > 0 && <div className="mt-4 pt-4 border-t border-[color:var(--color-border)] text-red-400"><h4 className="font-semibold">Unplaced Parts (Too Long):</h4><ul className="list-disc pl-5 text-sm">{results.unplacedParts.map((p,i) => <li key={i}>{p.rawMaterial} - {convertFromBaseUnit(p.length, partsUnit).toFixed(2)} {partsUnit} - Qty: {p.quantity}</li>)}</ul></div>}
                    </Card>

                    {stockSummaryData.length > 0 && (
                        <Card title="Total Stock Used">
                            <div className="relative">
                                 <button 
                                    onClick={handleCopyStockSummary} 
                                    title={isCopied ? 'Copied!' : 'Copy Table'}
                                    className="absolute -top-16 right-0 flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold text-[color:var(--color-text-muted)] bg-[color:var(--color-surface)] hover:bg-[color:var(--color-bg)] rounded-md transition-colors disabled:bg-slate-600"
                                    disabled={isCopied}
                                >
                                    {isCopied ? <CheckIcon/> : <ClipboardIcon />}
                                    <span>{isCopied ? 'Copied!' : 'Copy Table'}</span>
                                </button>
                                <div className="overflow-x-auto border border-[color:var(--color-border)] rounded-lg bg-[color:var(--color-surface)]">
                                    <table className="w-full text-center">
                                        <thead className="bg-[color:var(--color-bg)]">
                                            <tr className="border-b border-[color:var(--color-border)]">
                                                {['Raw Material', 'Stock Used (m)', 'Stock Qty', `Utilized Length (${partsUnit})`, `Wastage Length (${partsUnit})`].map(h => (
                                                    <th key={h} className="p-3 font-semibold text-[color:var(--color-text-muted)] text-sm">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[color:var(--color-border)]">
                                            {stockSummaryData.map(row => (
                                                <tr key={row.rawMaterial} className="hover:bg-[color:var(--color-input-bg)] text-sm text-[color:var(--color-text)] transition-colors">
                                                    <td className="p-3 font-medium">{row.rawMaterial}</td>
                                                    <td className="p-3">{row.stockUsedInLength}</td>
                                                    <td className="p-3">{row.stockQuantity}</td>
                                                    <td className="p-3">{row.utilizedLength}</td>
                                                    <td className="p-3">{row.wastageLength}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </Card>
                    )}

                    <div className="space-y-4">
                        {groupedLayouts.map(({ layout, quantity, stockIndices }, index) => (
                            <Card key={index}>
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h4 className="font-semibold text-lg text-[color:var(--color-text)]">Layout Pattern #{index + 1}</h4>
                                        <p className="text-xs text-[color:var(--color-text-muted)] mt-1">
                                            Stock Bar(s): #{formatNumberRanges(stockIndices)}
                                        </p>
                                    </div>
                                    <div className="text-right flex-shrink-0 ml-4 space-y-1">
                                        <div className="flex items-center justify-end space-x-2">
                                            <div className="bg-[color:var(--color-surface)] text-[color:var(--color-text-muted)] text-xs font-bold px-2.5 py-1 rounded-full">
                                                {layout.rawMaterial}
                                            </div>
                                            <div className="bg-[color:var(--color-primary)] text-[color:var(--color-text-inv)] text-sm font-bold px-3 py-1 rounded-full">
                                                Qty: {quantity}
                                            </div>
                                        </div>
                                        <p className="text-sm font-medium text-red-400">
                                            Wastage: {convertFromBaseUnit(layout.wasteLength, partsUnit).toFixed(2)} {partsUnit} ({layout.wastePercentage.toFixed(2)}%)
                                        </p>
                                    </div>
                                </div>
                                <StockLayoutBar
                                    layout={layout}
                                    unit={partsUnit}
                                    leftAllowanceBase={convertToBaseUnit(leftEndAllowance, allowanceUnit)}
                                    rightAllowanceBase={convertToBaseUnit(rightEndAllowance, allowanceUnit)}
                                />
                            </Card>
                        ))}
                    </div>

                     <div className="mt-8 flex items-center justify-center">
                        <button
                            onClick={handleAddOutputData}
                            className="flex items-center justify-center px-6 py-3 bg-[color:var(--color-accent)] text-white font-semibold rounded-lg hover:bg-[color:var(--color-primary)] transition-colors shadow-lg shadow-blue-500/20 disabled:bg-slate-600"
                            disabled={!results}
                        >
                            📤 Add Output Data
                        </button>
                    </div>

                </div>
            )}
        </div>
    );
};

const OutputDataPage: React.FC = () => {
    const { outputData, rules, setRules, projectName, clearOutput } = useOutputData();
    const { showToast } = useToast();
    const [isCopied, setIsCopied] = useState(false);

    const sortedData = useMemo(() => {
        const getSortKeys = (row: OutputDataRow) => {
            let categoryKey = 99; // 0: linear, 1: sheet, 2: plate
            let majorCategoryKey = 99; // For sheets/plates: 0: GP, 1: AL, 2: Other, 3: SS, 4: MS
            let msSubGradeKey = 99; // For MS: 0: IS 513, 1: IS 1079, 2: IS 2062
            let thickness = 0;
            let area = 0;
            const description = row.description;

            if (row.type === 'linear') {
                categoryKey = 0;
            } else { // type is 'sheet'
                // Plate is a sub-type of sheet, determined by thickness > 16mm
                const plateRegex = /PLATE (\d+\.?\d*)\s*THK/i;
                const sheetRegex = /SHEET (\d+\.?\d*)\s*×\s*(\d+\.?\d*)\s*×\s*(\d+\.?\d*)/i;
                
                let plateMatch = description.match(plateRegex);
                let sheetMatch = description.match(sheetRegex);

                if (plateMatch) {
                    thickness = parseFloat(plateMatch[1]);
                } else if (sheetMatch) {
                    thickness = parseFloat(sheetMatch[3]); // Corrected index for thickness
                    const length = parseFloat(sheetMatch[1]);
                    const width = parseFloat(sheetMatch[2]);
                    area = length * width;
                }

                categoryKey = thickness > 16 ? 2 : 1;
                
                const upperDesc = description.toUpperCase();
                
                // Major category sorting
                if (upperDesc.includes('GP')) majorCategoryKey = 0;
                else if (upperDesc.includes('ALUMINIUM') || upperDesc.includes('AL')) majorCategoryKey = 1;
                // Other grades must come before SS and MS
                else if (upperDesc.includes('SS')) majorCategoryKey = 3;
                else if (upperDesc.includes('MS') || upperDesc.includes('IS 513') || upperDesc.includes('IS 1079') || upperDesc.includes('IS 2062')) {
                    majorCategoryKey = 4;
                    if (upperDesc.includes('IS 513')) msSubGradeKey = 0;
                    else if (upperDesc.includes('IS 1079')) msSubGradeKey = 1;
                    else if (upperDesc.includes('IS 2062')) msSubGradeKey = 2;
                    else msSubGradeKey = 3; // Generic MS
                } else {
                    majorCategoryKey = 2; // "Other New Grades"
                }
            }
            
            return { categoryKey, majorCategoryKey, msSubGradeKey, thickness, area, description };
        };

        return [...outputData].sort((a, b) => {
            const keysA = getSortKeys(a);
            const keysB = getSortKeys(b);

            // 1. Primary sort: Linear -> Sheets -> Plates
            if (keysA.categoryKey !== keysB.categoryKey) return keysA.categoryKey - keysB.categoryKey;
            
            // If both are linear, sort by description
            if (keysA.categoryKey === 0) return keysA.description.localeCompare(keysB.description);
            
            // 2. For Sheets/Plates: Sort by Major Category (GP, AL, Other, SS, MS)
            if (keysA.majorCategoryKey !== keysB.majorCategoryKey) return keysA.majorCategoryKey - keysB.majorCategoryKey;
            
            // 3. For MS Sheets/Plates: Sort by sub-grade
            if (keysA.majorCategoryKey === 4) { // Both are MS
                if (keysA.msSubGradeKey !== keysB.msSubGradeKey) return keysA.msSubGradeKey - keysB.msSubGradeKey;
            }
            
            // 4. Then by Thickness (Low to High)
            if (keysA.thickness !== keysB.thickness) return keysA.thickness - keysB.thickness;
            
            // 5. Then by Sheet Size (Small to Large area)
            if (keysA.area !== keysB.area) return keysA.area - keysB.area;
            
            // Fallback sort
            return keysA.description.localeCompare(keysB.description);
        });
    }, [outputData]);
    
    const handleCopy = () => {
        const header = ['Description', 'Length/Mtr', 'Weight/Kg', 'Remarks'].join('\t');
        const rows = sortedData.map(d => [d.description, d.lengthMtr, d.weightKg, d.remarks].join('\t'));
        const textToCopy = [`${projectName} RM`, header, ...rows].join('\n');
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    };

    const handleClear = () => {
        if (window.confirm('Are you sure you want to clear all output data? This action cannot be undone.')) {
            clearOutput();
            showToast('Output Data cleared successfully.');
        }
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-9">
                    <Card title={
                         <div className="flex justify-between items-center w-full">
                            <span>📋 {projectName} RM</span>
                             <div className="flex items-center space-x-2">
                                <button onClick={handleClear} title="Clear Data" className="flex items-center justify-center p-2 text-sm font-semibold text-red-400 bg-[color:var(--color-surface)] hover:bg-[color:var(--color-bg)] rounded-md transition-colors" >
                                     <TrashIcon />
                                </button>
                                <button onClick={handleCopy} disabled={isCopied} title={isCopied ? 'Copied!' : 'Copy Table'} className="flex items-center justify-center p-2 text-sm font-semibold text-[color:var(--color-primary)] bg-[color:var(--color-surface)] hover:bg-[color:var(--color-bg)] rounded-md transition-colors disabled:opacity-50">
                                   {isCopied ? <CheckIcon /> : <DuplicateIcon />}
                                </button>
                             </div>
                        </div>
                    }>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-[color:var(--color-bg)]">
                                    <tr className="border-b border-[color:var(--color-border)]">
                                        <th className="p-3 font-semibold text-[color:var(--color-text-muted)]">Description</th>
                                        <th className="p-3 font-semibold text-[color:var(--color-text-muted)]">Length/Mtr</th>
                                        <th className="p-3 font-semibold text-[color:var(--color-text-muted)]">Weight/Kg</th>
                                        <th className="p-3 font-semibold text-[color:var(--color-text-muted)]">Remarks</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[color:var(--color-border)]">
                                    {sortedData.map(row => (
                                        <tr key={row.id} className="hover:bg-[color:var(--color-input-bg)]">
                                            <td className="p-3 font-medium">{row.description}</td>
                                            <td className="p-3">{row.lengthMtr}</td>
                                            <td className="p-3">{row.weightKg}</td>
                                            <td className="p-3">{row.remarks}</td>
                                        </tr>
                                    ))}
                                    {sortedData.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="text-center p-8 text-[color:var(--color-text-muted)]">
                                                No output data available.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
                 <div className="lg:col-span-3">
                     <Card title="⚙️ Output Data Rules" className="space-y-4 sticky top-24">
                        <InputField label="Sheet Utilization Threshold (%)" value={rules.utilizationThreshold} onChange={(e) => setRules(r => ({...r, utilizationThreshold: parseFloat(e.target.value) || 0 }))} helpText="Sheets utilized at or above this % are considered 'full'."/>
                        <InputField label="Stocks Utilization Threshold (%)" value={rules.linearUtilizationThreshold} onChange={(e) => setRules(r => ({...r, linearUtilizationThreshold: parseFloat(e.target.value) || 0 }))} helpText="Stocks utilized at or above this % are considered 'full'."/>
                        <InputField label="Mixed Utilization Multiplier (%)" value={rules.mixedUtilizationMultiplier} onChange={(e) => setRules(r => ({...r, mixedUtilizationMultiplier: parseFloat(e.target.value) || 0 }))} helpText="Multiplier for mixed high/low utilization sheets."/>
                        <InputField label="Plate Weight Multiplier (%)" value={rules.plateMultiplier} onChange={(e) => setRules(r => ({...r, plateMultiplier: parseFloat(e.target.value) || 0 }))} helpText="Multiplier for plates (>16mm thk)."/>
                    </Card>
                 </div>
            </div>
        </div>
    );
};

function App() {
  return (
    <HashRouter>
        <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-grow">
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/sheet-metal" element={<SheetMetalPage />} />
                    <Route path="/linear-nesting" element={<LinearNestingPage />} />
                    <Route path="/output-data" element={<OutputDataPage />} />
                </Routes>
            </main>
            <footer className="bg-transparent mt-12 py-6 text-center text-sm text-[color:var(--color-text-muted)] opacity-50 border-t border-[color:var(--color-border)]">
                © {new Date().getFullYear()} NESTINGAI. All rights reserved By Sourav K
            </footer>
        </div>
    </HashRouter>
  );
}

export default App;
