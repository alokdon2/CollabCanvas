
export interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: { type: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: any[] | null;
  updated: number;
  link: string | null;
  locked: boolean;
  // For text elements
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  baseline?: number;
  // For other element types, add their specific properties if needed
  [key: string]: any;
}

// A simplified representation, Excalidraw's AppState is more complex
export interface ExcalidrawAppState {
  viewBackgroundColor?: string;
  currentItemStrokeColor?: string;
  // Add other AppState properties you want to store/restore
  [key: string]: any;
}

// A simplified representation for Excalidraw's BinaryFiles
export interface ExcalidrawBinaryFiles {
  [id: string]: any; // Typically { dataURL: string, mimeType: string, created: number }
}

export interface WhiteboardData {
  elements: readonly ExcalidrawElement[];
  appState?: ExcalidrawAppState;
  files?: ExcalidrawBinaryFiles;
}

export interface FileSystemNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileSystemNode[]; // Only for folders
  content?: string; // Only for files, initially empty or storing simple text
}

export interface Project {
  id: string;
  name: string;
  textContent: string;
  whiteboardContent: WhiteboardData | null;
  fileSystemRoots: FileSystemNode[]; // Added for file explorer
  createdAt: string; 
  updatedAt: string; 
}

