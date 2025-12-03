export const normalizeName = (name: string): string => {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\u200B/g, "");
};

export const splitPastedText = (text: string): string[] => {
  if (!text) return [];
  return text
    .split(/[\n;,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
};

export const getExtension = (filename: string): string => {
  const m = filename.match(/(\.[^.\\/\\?%#:]+)$/);
  return m ? m[1].toLowerCase() : "";
};

export const PRIMARY_EXTENSIONS = [
  ".pdf", ".dwg", ".dxf", ".xls", ".xlsx", ".csv",
  ".doc", ".docx", ".sldprt", ".sldasm", ".slddrw",
  ".prt", ".asm", ".drw", ".step", ".stp",
];

export const MORE_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".txt", ".json", ".xml",
  ".bmp", ".gif", ".zip", ".rar", ".js", ".ts", ".tsx",
  ".html", ".css", ".md"
];

export const ALL_EXTENSIONS = [...PRIMARY_EXTENSIONS, ...MORE_EXTENSIONS];

export const formatBytes = (bytes: number, decimals = 2) => {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};