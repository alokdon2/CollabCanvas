
'use server';
/**
 * @fileOverview Placeholder service for real-time collaboration.
 * In a real application, these functions would interact with a backend service
 * like Firebase Realtime Database, Firestore, or a custom WebSocket server.
 */
import type { Project } from '@/lib/types';

// Simulate a backend data store (in a real app, this would be your actual backend)
const backendProjectData: Record<string, Project> = {};
const projectUpdateListeners: Record<string, Array<(project: Project) => void>> = {};

/**
 * Simulates loading project data from a real-time backend.
 * @param projectId The ID of the project to load.
 * @returns A Promise that resolves to the project data or null if not found.
 */
export async function loadProjectData(projectId: string): Promise<Project | null> {
  console.log(`[RealtimeService] Attempting to load project: ${projectId}`);
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  if (backendProjectData[projectId]) {
    console.log(`[RealtimeService] Project ${projectId} loaded from backend.`);
    return JSON.parse(JSON.stringify(backendProjectData[projectId])); // Return a copy
  }
  console.log(`[RealtimeService] Project ${projectId} not found in backend.`);
  return null;
}

/**
 * Simulates saving project data to a real-time backend.
 * @param project The project data to save.
 */
export async function saveProjectData(project: Project): Promise<void> {
  console.log(`[RealtimeService] Saving project: ${project.id}`);
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  backendProjectData[project.id] = JSON.parse(JSON.stringify(project)); // Store a copy

  // Notify listeners about the update
  if (projectUpdateListeners[project.id]) {
    console.log(`[RealtimeService] Notifying ${projectUpdateListeners[project.id].length} listeners for project ${project.id}`);
    projectUpdateListeners[project.id].forEach(callback => callback(JSON.parse(JSON.stringify(project))));
  }
  console.log(`[RealtimeService] Project ${project.id} saved to backend.`);
}

/**
 * Simulates subscribing to real-time updates for a project.
 * @param projectId The ID of the project to listen to.
 * @param onUpdateCallback A callback function to execute when the project is updated.
 * @returns An unsubscribe function.
 */
export function subscribeToProjectUpdates(
  projectId: string,
  onUpdateCallback: (updatedProject: Project) => void
): () => void {
  console.log(`[RealtimeService] Subscribing to updates for project: ${projectId}`);
  if (!projectUpdateListeners[projectId]) {
    projectUpdateListeners[projectId] = [];
  }
  projectUpdateListeners[projectId].push(onUpdateCallback);

  // Return an unsubscribe function
  return () => {
    console.log(`[RealtimeService] Unsubscribing from updates for project: ${projectId}`);
    projectUpdateListeners[projectId] = projectUpdateListeners[projectId].filter(
      cb => cb !== onUpdateCallback
    );
    if (projectUpdateListeners[projectId].length === 0) {
      delete projectUpdateListeners[projectId];
    }
  };
}

// Note: For a more complex application, you might manage individual unsubscribe calls
// or have a more sophisticated listener management system.
// The `unsubscribeFromProjectUpdates` function below is an alternative way
// to clear all listeners for a specific project, if needed.

/**
 * Simulates unsubscribing from all updates for a specific project.
 * This is a more general cleanup than the specific unsubscribe returned by subscribeToProjectUpdates.
 * @param projectId The ID of the project.
 */
export function unsubscribeFromAllProjectUpdates(projectId: string): void {
  console.log(`[RealtimeService] Unsubscribing from ALL updates for project: ${projectId}`);
  delete projectUpdateListeners[projectId];
}
