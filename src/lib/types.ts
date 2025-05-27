// Using 'any' for ExcalidrawElement as the exact type from @excalidraw/excalidraw
// can be verbose and is not strictly necessary for this mock.
// In a real app, you would import ExcalidrawElement from the library.
export interface ExcalidrawElement {
  type: string;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  id: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  roundness: { type: number } | null;
  seed: number;
  backgroundColor: string;
  width: number;
  height: number;
  angle: number;
  x: number;
  y: number;
  strokeColor: string;
  [key: string]: any; // For other properties like points, text, etc.
}

export interface WhiteboardData {
  elements: readonly ExcalidrawElement[];
  appState: object | null; // Simplified, Excalidraw's AppState is complex
  files: object | null; // Simplified
}

export interface Project {
  id: string;
  name: string;
  textContent: string;
  whiteboardContent: WhiteboardData | null;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}
