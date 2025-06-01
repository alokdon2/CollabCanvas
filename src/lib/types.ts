
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
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  baseline?: number;
  [key: string]: any;
}

export interface ExcalidrawAppState {
  viewBackgroundColor?: string;
  currentItemStrokeColor?: string;
  [key: string]: any;
}

export interface ExcalidrawBinaryFiles {
  [id: string]: any;
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
  children?: FileSystemNode[];
  // Content specific to files AND folders
  textContent?: string; 
  whiteboardContent?: WhiteboardData | null;
  content?: string; // Legacy or for simple text, can be phased out or used for non-editor files
}

export interface Project {
  id: string;
  name: string;
  ownerId?: string; // Added ownerId field
  // Root level content for when no file or folder is selected (or for project overview)
  textContent: string;
  whiteboardContent: WhiteboardData | null;
  fileSystemRoots: FileSystemNode[];
  createdAt: string; 
  updatedAt: string; 
}

