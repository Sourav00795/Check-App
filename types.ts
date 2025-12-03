export interface FileItem {
  name: string;
  path: string;
  extension: string;
  size: number;
  lastModified?: number;
  // Handle is used for File System Access API
  handle?: FileSystemFileHandle;
  // File object is used for legacy <input> fallback
  fileObj?: File;
}

export interface SearchResult {
  query: string;
  status: 'FOUND' | 'MISSING';
  count: number;
  matches: FileItem[];
}

export interface SearchProgress {
  done: number;
  total: number;
  currentName: string | null;
}

// Augment the Window interface for File System Access API types if not globally available
declare global {
  interface Window {
    showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
  }
}