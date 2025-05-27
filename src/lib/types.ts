
// Whiteboard related types (ExcalidrawElement, WhiteboardData) are removed.

export interface Project {
  id: string;
  name: string;
  textContent: string;
  // whiteboardContent: WhiteboardData | null; // Removed
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}
