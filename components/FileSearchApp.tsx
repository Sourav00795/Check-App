import React, { useState, useRef, useEffect, useCallback } from "react";
import { VirtualizedList } from "./VirtualList";
import { FileItem, SearchResult, SearchProgress } from "../types";
import { 
  normalizeName, 
  splitPastedText, 
  getExtension, 
  PRIMARY_EXTENSIONS, 
  MORE_EXTENSIONS, 
  ALL_EXTENSIONS,
  formatBytes
} from "../utils";

// --- Icons ---
const FolderIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>;
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>;
const XIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>;
const CopyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>;

export default function FileSearchApp() {
  const [isSecure] = useState(window.isSecureContext);
  
  // -- State --
  const [rootFolderName, setRootFolderName] = useState<string | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexedCount, setIndexedCount] = useState(0);
  const [indexMap, setIndexMap] = useState<Map<string, FileItem[]>>(() => new Map());
  const [fileListFlat, setFileListFlat] = useState<FileItem[]>([]);
  
  const [pastedText, setPastedText] = useState("");
  const [selectedExtensions, setSelectedExtensions] = useState<string[]>([]);
  const [extSearch, setExtSearch] = useState("");
  
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState<SearchProgress>({ done: 0, total: 0, currentName: null });
  const [results, setResults] = useState<SearchResult[]>([]);

  const cancelIndexRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -- Handlers --

  const resetIndex = useCallback(() => {
    setIndexedCount(0);
    setFileListFlat([]);
    setIndexMap(new Map());
    setResults([]);
  }, []);

  const handleSelectFolder = async () => {
    try {
      if (isSecure && window.showDirectoryPicker) {
        const dirHandle = await window.showDirectoryPicker();
        setRootFolderName(dirHandle.name);
        await buildIndexFromHandle(dirHandle);
      } else {
        // Fallback
        fileInputRef.current?.click();
      }
    } catch (err: any) {
      if (!err.message?.includes('user')) { // ignore user cancel
         console.error(err);
         alert("Could not access folder. Ensure you are using a supported browser or HTTPS.");
      }
    }
  };

  const handleDirectoryInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length) return;
    
    const rootPath = files[0].webkitRelativePath.split('/')[0];
    setRootFolderName(rootPath || "Selected Files");
    
    // Build index from file list (legacy)
    cancelIndexRef.current = false;
    setIsIndexing(true);
    resetIndex();

    const map = new Map<string, FileItem[]>();
    const flat: FileItem[] = [];
    let count = 0;

    // Process using chunking to avoid freezing UI
    const processChunk = async () => {
        const CHUNK_SIZE = 500;
        for (let i = 0; i < files.length; i++) {
            if (cancelIndexRef.current) break;
            
            const file = files[i];
            const fi: FileItem = {
                name: file.name,
                path: file.webkitRelativePath || file.name,
                extension: getExtension(file.name),
                size: file.size,
                lastModified: file.lastModified,
                fileObj: file
            };
            
            const key = normalizeName(file.name);
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(fi);
            flat.push(fi);
            count++;

            if (count % CHUNK_SIZE === 0) {
                setIndexedCount(count);
                await new Promise(r => setTimeout(r, 0));
            }
        }
        setIndexMap(map);
        setFileListFlat(flat);
        setIndexedCount(count);
        setIsIndexing(false);
    };

    processChunk();
  };

  const buildIndexFromHandle = async (dirHandle: FileSystemDirectoryHandle) => {
    resetIndex();
    cancelIndexRef.current = false;
    setIsIndexing(true);

    const map = new Map<string, FileItem[]>();
    const flat: FileItem[] = [];
    let count = 0;

    const walk = async (handle: FileSystemHandle, path: string) => {
      if (cancelIndexRef.current) return;

      if (handle.kind === 'file') {
        const fileHandle = handle as FileSystemFileHandle;
        try {
            const file = await fileHandle.getFile();
            const fi: FileItem = {
                name: file.name,
                path: path,
                extension: getExtension(file.name),
                size: file.size,
                lastModified: file.lastModified,
                handle: fileHandle
            };
            
            const key = normalizeName(file.name);
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(fi);
            flat.push(fi);
            count++;

            if (count % 200 === 0) {
                setIndexedCount(count);
                await new Promise(r => setTimeout(r, 0));
            }
        } catch (e) {
            console.warn("Skipping file due to access error", e);
        }
      } else if (handle.kind === 'directory') {
        const dirHandle = handle as FileSystemDirectoryHandle;
        for await (const entry of dirHandle.values()) {
             await walk(entry, path ? `${path}/${entry.name}` : entry.name);
        }
      }
    };

    try {
        await walk(dirHandle, "");
    } catch (e) {
        console.error(e);
        alert("Error during indexing.");
    }

    setIndexMap(map);
    setFileListFlat(flat);
    setIndexedCount(count);
    setIsIndexing(false);
  };

  const handleSearch = async () => {
    if (!indexMap.size && !fileListFlat.length) {
        alert("Please index a folder first.");
        return;
    }

    const queries = splitPastedText(pastedText);
    if (!queries.length) return;

    setIsSearching(true);
    setResults([]);
    
    // Deduplicate queries
    const uniqueQueries = Array.from(new Set(queries));
    const newResults: SearchResult[] = [];

    for (let i = 0; i < uniqueQueries.length; i++) {
        const q = uniqueQueries[i];
        setSearchProgress({ done: i + 1, total: uniqueQueries.length, currentName: q });

        // Search Strategy
        let matches: FileItem[] = [];
        
        // 1. Exact match normalized
        const normalizedQ = normalizeName(q);
        
        // 2. Try with extensions if selected
        const candidates = [normalizedQ];
        if (selectedExtensions.length > 0 && !getExtension(q)) {
            selectedExtensions.forEach(ext => candidates.push(normalizeName(q + ext)));
        } else if (selectedExtensions.length === 0 && !getExtension(q)) {
            // If no extension in query and no extension selected, maybe user meant to find *any* extension?
            // This implementation strictly looks for the name provided.
            // But we can check if normalizedQ matches file name without extension
        }

        for (const candidate of candidates) {
            if (indexMap.has(candidate)) {
                matches = [...matches, ...indexMap.get(candidate)!];
            }
        }
        
        // Fallback: If not found, scan flat list (slower but thorough for partials if we wanted, but sticking to O(1) mostly)
        // Implementation decision: Only Map lookup for speed as requested.
        
        // Deduplicate matches based on path
        const seenPaths = new Set();
        matches = matches.filter(m => {
            if (seenPaths.has(m.path)) return false;
            seenPaths.add(m.path);
            return true;
        });

        newResults.push({
            query: q,
            status: matches.length > 0 ? 'FOUND' : 'MISSING',
            count: matches.length,
            matches
        });

        // Update UI in chunks
        if (i % 20 === 0) {
            setResults([...newResults]);
            await new Promise(r => setTimeout(r, 0));
        }
    }

    setResults(newResults);
    setIsSearching(false);
    setSearchProgress(prev => ({...prev, currentName: null}));
  };

  const openFile = async (item: FileItem) => {
    try {
        let blob: Blob | null = null;
        if (item.handle) {
            const file = await item.handle.getFile();
            blob = file;
        } else if (item.fileObj) {
            blob = item.fileObj;
        }

        if (blob) {
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            // Clean up url after delay? usually complex with windows
        }
    } catch (e) {
        alert("Failed to open file. Browser security may prevent this.");
    }
  };

  const toggleExtension = (ext: string) => {
    setSelectedExtensions(prev => 
        prev.includes(ext) ? prev.filter(e => e !== ext) : [...prev, ext]
    );
  };

  const copyToClipboard = () => {
    const text = results.map(r => 
        `${r.query}\t${r.status}\t${r.matches[0]?.path || ''}`
    ).join('\n');
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const clearAll = () => {
    setPastedText("");
    setResults([]);
    setSelectedExtensions([]);
  };

  const filteredExtensions = ALL_EXTENSIONS.filter(ext => 
      ext.includes(extSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background text-text font-sans selection:bg-primary selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-surface/95 backdrop-blur border-b border-border shadow-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white font-bold">
              HF
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">HookFiles <span className="text-primary font-normal">Pro</span></h1>
          </div>
          
          <div className="flex items-center gap-4 text-sm">
             <div className="flex flex-col items-end">
                <span className="text-xs text-muted">Status</span>
                <span className={`font-mono ${isIndexing ? 'text-yellow-400 animate-pulse' : 'text-secondary'}`}>
                    {isIndexing ? 'Indexing...' : indexedCount > 0 ? 'Ready' : 'Idle'}
                </span>
             </div>
          </div>
        </div>
        
        {/* Progress Bar */}
        {(isIndexing || isSearching) && (
           <div className="h-1 bg-surface w-full overflow-hidden">
             <div 
               className="h-full bg-primary transition-all duration-300 ease-out"
               style={{ 
                   width: isSearching 
                    ? `${(searchProgress.done / searchProgress.total) * 100}%` 
                    : `${Math.min((indexedCount % 1000) / 10, 100)}%` // Fake progress for unknown total indexing
               }}
             />
           </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Controls */}
        <div className="lg:col-span-4 space-y-6">
            
            {/* Folder Selection Card */}
            <div className="bg-surface rounded-lg border border-border p-4 shadow-sm">
                <h2 className="text-sm uppercase tracking-wider text-muted font-semibold mb-4">Source Directory</h2>
                
                <div className="flex flex-col gap-3">
                    <button 
                        onClick={handleSelectFolder}
                        disabled={isIndexing}
                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-primary hover:bg-blue-600 text-white rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <FolderIcon />
                        {rootFolderName ? 'Change Folder' : 'Select Folder to Index'}
                    </button>
                    
                    {/* Hidden Input Fallback */}
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        className="hidden"
                        // @ts-ignore
                        webkitdirectory="" 
                        directory="" 
                        multiple 
                        onChange={handleDirectoryInput}
                    />

                    {rootFolderName && (
                        <div className="bg-background rounded p-3 text-xs font-mono border border-border break-all">
                            <span className="text-muted block mb-1">Current Root:</span>
                            <span className="text-cyan-400">{rootFolderName}</span>
                            <div className="mt-2 text-muted">Files Indexed: {indexedCount.toLocaleString()}</div>
                        </div>
                    )}

                    {isIndexing && (
                        <button 
                            onClick={() => cancelIndexRef.current = true}
                            className="text-xs text-danger hover:underline text-center"
                        >
                            Stop Indexing
                        </button>
                    )}
                </div>
            </div>

            {/* Input Card */}
            <div className="bg-surface rounded-lg border border-border p-4 shadow-sm flex flex-col h-[500px]">
                <h2 className="text-sm uppercase tracking-wider text-muted font-semibold mb-4">Search Input</h2>
                
                <div className="flex-1 flex flex-col gap-2 min-h-0">
                    <textarea
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        placeholder="Paste list of filenames here (e.g. part_number_123)"
                        className="flex-1 bg-background border border-border rounded p-3 text-sm font-mono text-text placeholder-gray-600 focus:outline-none focus:border-primary resize-none custom-scrollbar"
                    />
                </div>
                
                {/* Extensions Filter */}
                <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex justify-between items-center mb-2">
                         <span className="text-xs font-semibold text-muted">Append Extensions (Optional)</span>
                         {selectedExtensions.length > 0 && (
                             <button onClick={() => setSelectedExtensions([])} className="text-xs text-primary hover:underline">Clear</button>
                         )}
                    </div>
                    
                    <div className="flex flex-wrap gap-1.5 mb-2 max-h-20 overflow-y-auto custom-scrollbar">
                        {selectedExtensions.map(ext => (
                            <span key={ext} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/20 text-primary border border-primary/30 rounded text-xs">
                                {ext}
                                <button onClick={() => toggleExtension(ext)}><XIcon /></button>
                            </span>
                        ))}
                    </div>

                    <div className="relative group">
                        <input 
                           className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text focus:border-primary focus:outline-none"
                           placeholder="Filter extensions..."
                           value={extSearch}
                           onChange={e => setExtSearch(e.target.value)}
                        />
                        <div className="absolute top-full left-0 w-full bg-surface border border-border shadow-xl rounded mt-1 max-h-32 overflow-y-auto z-10 hidden group-focus-within:block">
                            {filteredExtensions.map(ext => (
                                <button 
                                    key={ext}
                                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-background ${selectedExtensions.includes(ext) ? 'text-primary' : 'text-muted'}`}
                                    onClick={() => toggleExtension(ext)}
                                >
                                    {ext}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex gap-2">
                    <button 
                        onClick={handleSearch}
                        disabled={isSearching || isIndexing}
                        className="flex-1 bg-white text-black font-bold py-2 rounded hover:bg-gray-200 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        <SearchIcon /> Search
                    </button>
                    <button 
                        onClick={clearAll}
                        className="px-3 bg-border hover:bg-gray-600 rounded text-white transition-colors"
                        title="Clear All"
                    >
                        <XIcon />
                    </button>
                </div>
            </div>
        </div>

        {/* RIGHT COLUMN: Results */}
        <div className="lg:col-span-8 flex flex-col h-[calc(100vh-8rem)]">
             <div className="flex justify-between items-center mb-4">
                 <h2 className="text-lg font-semibold text-white">Results <span className="text-muted text-sm font-normal">({results.length})</span></h2>
                 {results.length > 0 && (
                     <button onClick={copyToClipboard} className="text-xs flex items-center gap-1 bg-surface border border-border px-3 py-1.5 rounded hover:bg-border transition-colors">
                         <CopyIcon /> Copy Results
                     </button>
                 )}
             </div>

             <div className="flex-1 bg-surface border border-border rounded-lg overflow-hidden flex flex-col shadow-lg">
                 {/* Table Header */}
                 <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-[#0d1117] border-b border-border text-xs font-semibold text-muted uppercase tracking-wider">
                     <div className="col-span-4">Query Name</div>
                     <div className="col-span-2">Status</div>
                     <div className="col-span-4">Found Path</div>
                     <div className="col-span-2 text-right">Action</div>
                 </div>

                 {/* Empty State */}
                 {results.length === 0 && !isSearching && (
                     <div className="flex-1 flex flex-col items-center justify-center text-muted p-8">
                         <div className="w-16 h-16 rounded-full bg-border flex items-center justify-center mb-4 opacity-50">
                             <SearchIcon />
                         </div>
                         <p>Ready to search.</p>
                         <p className="text-xs mt-2">Index a folder, paste filenames, and hit search.</p>
                     </div>
                 )}
                 
                 {/* Virtualized List */}
                 {results.length > 0 && (
                     <div className="flex-1 relative bg-background">
                         <VirtualizedList<SearchResult>
                             items={results}
                             rowHeight={60}
                             height={600} // This would ideally use a ResizeObserver to fill parent
                             className="h-full"
                             renderRow={(result, index) => {
                                 const isFound = result.status === 'FOUND';
                                 return (
                                     <div className={`grid grid-cols-12 gap-4 px-4 py-2 items-center border-b border-border/50 hover:bg-surface/50 transition-colors h-full text-sm ${!isFound ? 'opacity-60' : ''}`}>
                                         <div className="col-span-4 truncate font-medium text-text" title={result.query}>
                                             {result.query}
                                         </div>
                                         <div className="col-span-2">
                                             <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${isFound ? 'bg-secondary/10 text-secondary border-secondary/20' : 'bg-danger/10 text-danger border-danger/20'}`}>
                                                 {isFound ? <CheckIcon /> : <XIcon />}
                                                 {isFound ? `FOUND (${result.count})` : 'MISSING'}
                                             </span>
                                         </div>
                                         <div className="col-span-4 truncate text-xs font-mono text-muted" title={result.matches[0]?.path || '-'}>
                                             {result.matches[0]?.path || '-'}
                                         </div>
                                         <div className="col-span-2 text-right">
                                             {isFound && (
                                                <button 
                                                    onClick={() => openFile(result.matches[0])}
                                                    className="text-xs bg-primary hover:bg-blue-600 text-white px-2 py-1 rounded transition-colors"
                                                >
                                                    Open
                                                </button>
                                             )}
                                         </div>
                                     </div>
                                 );
                             }}
                         />
                     </div>
                 )}
             </div>
        </div>

      </main>
    </div>
  );
}