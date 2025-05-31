
/**
 * @fileOverview Placeholder service for real-time collaboration.
 * In a real application, these functions would interact with a backend service
 * like Firebase Realtime Database, Firestore, or a custom WebSocket server.
 */
import type { Project } from '@/lib/types';

// Simulate a backend data store (in a real app, this would be your actual backend)
// Since 'use server' is removed, these are now client-side module-level variables.
const backendProjectData: Record<string, Project> = {};
const projectUpdateListeners: Record<string, Array<(project: Project) => void>> = {};

/**
 * Simulates loading project data from a real-time backend.
 * @param projectId The ID of the project to load.
 * @returns A Promise that resolves to the project data or null if not found.
 */
export async function loadProjectData(projectId: string): Promise<Project | null> {
  console.log(`[ClientSimService] Attempting to load project: ${projectId}`);
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  if (backendProjectData[projectId]) {
    console.log(`[ClientSimService] Project ${projectId} loaded from client-side store.`);
    return JSON.parse(JSON.stringify(backendProjectData[projectId])); // Return a copy
  }
  console.log(`[ClientSimService] Project ${projectId} not found in client-side store.`);
  return null;
}

/**
 * Simulates saving project data to a real-time backend.
 * @param project The project data to save.
 */
export async function saveProjectData(project: Project): Promise<void> {
  console.log(`[ClientSimService] Saving project: ${project.id}`);
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  backendProjectData[project.id] = JSON.parse(JSON.stringify(project)); // Store a copy

  // Notify listeners about the update
  if (projectUpdateListeners[project.id]) {
    console.log(`[ClientSimService] Notifying ${projectUpdateListeners[project.id].length} listeners for project ${project.id}`);
    projectUpdateListeners[project.id].forEach(callback => callback(JSON.parse(JSON.stringify(project))));
  }
  console.log(`[ClientSimService] Project ${project.id} saved to client-side store.`);
}

/**
 * Simulates subscribing to real-time updates for a project.
 * @param projectId The ID of the project to listen to.
 * @param onUpdateCallback A callback function to execute when the project is updated.
 * @returns A Promise that resolves to an unsubscribe function.
 */
export async function subscribeToProjectUpdates(
  projectId: string,
  onUpdateCallback: (updatedProject: Project) => void
): Promise<() => void> {
  console.log(`[ClientSimService] Subscribing to updates for project: ${projectId}`);
  // Simulate async operation if needed
  await new Promise(resolve => setTimeout(resolve, 10)); 
  
  if (!projectUpdateListeners[projectId]) {
    projectUpdateListeners[projectId] = [];
  }
  projectUpdateListeners[projectId].push(onUpdateCallback);

  // Return an unsubscribe function
  return () => {
    console.log(`[ClientSimService] Unsubscribing from updates for project: ${projectId}`);
    projectUpdateListeners[projectId] = projectUpdateListeners[projectId].filter(
      cb => cb !== onUpdateCallback
    );
    if (projectUpdateListeners[projectId].length === 0) {
      delete projectUpdateListeners[projectId];
    }
  };
}

/**
 * Simulates unsubscribing from all updates for a specific project.
 * This is a more general cleanup than the specific unsubscribe returned by subscribeToProjectUpdates.
 * @param projectId The ID of the project.
 */
export async function unsubscribeFromAllProjectUpdates(projectId: string): Promise<void> {
  console.log(`[ClientSimService] Unsubscribing from ALL updates for project: ${projectId}`);
  // Simulate async operation if needed
  await new Promise(resolve => setTimeout(resolve, 10)); 
  delete projectUpdateListeners[projectId];
}

/**
 * Simulates unsubscribing from a single project update subscription.
 * @param subscriptionId The ID of the subscription to remove (currently not used directly in this stub,
 *                       as unsubscribe function itself handles removal from array by callback identity).
 *                       This function is kept for API compatibility if a more complex ID-based system was used.
 */
export async function unsubscribeFromSingleProjectUpdate(subscriptionId: string): Promise<void> {
  // In the current setup, the unsubscribe function returned by subscribeToProjectUpdates
  // directly filters out the callback. An explicit subscriptionId isn't strictly necessary
  // for *this specific stub's internal logic* for unsubscribing a single listener,
  // but if the subscription mechanism were more complex (e.g. server-managed IDs), this would be used.
  console.log(`[ClientSimService] Call to unsubscribeFromSingleProjectUpdate with ID: ${subscriptionId}. Specific logic depends on how sub IDs are tracked.`);
  // For this stub, the actual unsubscription happens when the function returned by `subscribeToProjectUpdates` is called.
  // If we had a map of subscriptionId -> callback, we would use subscriptionId here.
  // Since we don't, this function can be a no-op or log for now, as the primary mechanism is the direct unsubscribe.
  await new Promise(resolve => setTimeout(resolve, 10));
}
