
/**
 * @fileOverview Service for real-time collaboration using Firebase Firestore.
 */
import { db } from '@/lib/firebase';
import type { Project, FileSystemNode, WhiteboardData } from '@/lib/types';
import { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  collection, 
  getDocs, 
  deleteDoc, 
  query, 
  orderBy,
  serverTimestamp, // Can be used if storing native Firestore timestamps
  Timestamp
} from 'firebase/firestore';

const PROJECTS_COLLECTION = 'projects';

// Helper to convert Firestore Timestamps to ISO strings if they exist
const convertTimestamps = (data: any): any => {
  if (data && typeof data === 'object') {
    for (const key in data) {
      if (data[key] instanceof Timestamp) {
        data[key] = data[key].toDate().toISOString();
      } else if (typeof data[key] === 'object') {
        convertTimestamps(data[key]); // Recurse for nested objects
      }
    }
  }
  return data;
};


/**
 * Loads project data from Firestore.
 * @param projectId The ID of the project to load.
 * @returns A Promise that resolves to the project data or null if not found.
 */
export async function loadProjectData(projectId: string): Promise<Project | null> {
  console.log(`[FirestoreService] Attempting to load project: ${projectId}`);
  try {
    const projectDocRef = doc(db, PROJECTS_COLLECTION, projectId);
    const docSnap = await getDoc(projectDocRef);
    if (docSnap.exists()) {
      console.log(`[FirestoreService] Project ${projectId} loaded.`);
      // Firestore Timestamps need to be converted if `Project` type expects strings
      const projectData = convertTimestamps(docSnap.data()) as Project;
      return projectData;
    } else {
      console.log(`[FirestoreService] Project ${projectId} not found.`);
      return null;
    }
  } catch (error) {
    console.error(`[FirestoreService] Error loading project ${projectId}:`, error);
    throw error; // Re-throw to be handled by caller
  }
}

/**
 * Saves project data to Firestore.
 * @param project The project data to save.
 */
export async function saveProjectData(project: Project): Promise<void> {
  console.log(`[FirestoreService] Saving project: ${project.id}`);
  try {
    const projectToSave = {
      ...project,
      updatedAt: new Date().toISOString(), // Ensure updatedAt is current
    };
    const projectDocRef = doc(db, PROJECTS_COLLECTION, project.id);
    await setDoc(projectDocRef, projectToSave, { merge: true }); // Use merge to allow partial updates if needed
    console.log(`[FirestoreService] Project ${project.id} saved.`);
  } catch (error) {
    console.error(`[FirestoreService] Error saving project ${project.id}:`, error);
    throw error;
  }
}

/**
 * Subscribes to real-time updates for a project from Firestore.
 * @param projectId The ID of the project to listen to.
 * @param onUpdateCallback A callback function to execute when the project is updated.
 * @returns A Promise that resolves to an unsubscribe function.
 */
export async function subscribeToProjectUpdates(
  projectId: string,
  onUpdateCallback: (updatedProject: Project) => void
): Promise<() => void> {
  console.log(`[FirestoreService] Subscribing to updates for project: ${projectId}`);
  const projectDocRef = doc(db, PROJECTS_COLLECTION, projectId);
  
  const unsubscribe = onSnapshot(projectDocRef, (docSnap) => {
    if (docSnap.exists()) {
      console.log(`[FirestoreService] Real-time update received for project ${projectId}`);
      const updatedProject = convertTimestamps(docSnap.data()) as Project;
      onUpdateCallback(updatedProject);
    } else {
      console.log(`[FirestoreService] Real-time update: Project ${projectId} deleted or does not exist.`);
      // Optionally, call callback with null or a specific signal for deletion
    }
  }, (error) => {
    console.error(`[FirestoreService] Error in real-time subscription for project ${projectId}:`, error);
    // Handle error, maybe try to re-subscribe or notify user
  });

  return unsubscribe; // This is the function to call to stop listening
}


export async function unsubscribeFromAllProjectUpdates(projectId: string): Promise<void> {
  // This function becomes less relevant as onSnapshot returns its own unsubscriber.
  // Kept for structural similarity if other types of "all updates" were managed.
  console.log(`[FirestoreService] UnsubscribeFromAllProjectUpdates called for ${projectId}. Individual listeners should be managed by their onSnapshot unsub function.`);
}


// --- Functions for Dashboard Page ---

const DEFAULT_EMPTY_TEXT_CONTENT = "<p></p>";
const DEFAULT_EMPTY_WHITEBOARD_DATA: WhiteboardData = {
  elements: [],
  appState: { ZenModeEnabled: false, viewModeEnabled: false },
  files: {}
};

const ensureNodeContentDefaults = (nodes: FileSystemNode[]): FileSystemNode[] => {
  return nodes.map(node => ({
    ...node,
    textContent: node.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
    whiteboardContent: node.whiteboardContent || { ...DEFAULT_EMPTY_WHITEBOARD_DATA },
    ...(node.children && { children: ensureNodeContentDefaults(node.children) }),
  }));
};

export async function getAllProjectsFromFirestore(): Promise<Project[]> {
  console.log('[FirestoreService] Fetching all projects for dashboard');
  try {
    const projectsColRef = collection(db, PROJECTS_COLLECTION);
    // Order by 'updatedAt' in descending order to show newest first
    const q = query(projectsColRef, orderBy('updatedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const projects = querySnapshot.docs.map(docSnap => convertTimestamps(docSnap.data()) as Project);
    console.log(`[FirestoreService] Fetched ${projects.length} projects.`);
    return projects.map(p => ({ // Ensure defaults on load for dashboard too
      ...p,
      textContent: p.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
      whiteboardContent: p.whiteboardContent || { ...DEFAULT_EMPTY_WHITEBOARD_DATA },
      fileSystemRoots: ensureNodeContentDefaults(p.fileSystemRoots || [])
    }));
  } catch (error) {
    console.error('[FirestoreService] Error fetching all projects:', error);
    throw error;
  }
}

export async function createProjectInFirestore(newProjectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
  console.log('[FirestoreService] Creating new project in Firestore:', newProjectData.name);
  try {
    const newProjectId = crypto.randomUUID();
    const now = new Date().toISOString();
    const projectToCreate: Project = {
      ...newProjectData,
      id: newProjectId,
      createdAt: now,
      updatedAt: now,
      fileSystemRoots: ensureNodeContentDefaults(newProjectData.fileSystemRoots || []),
      textContent: newProjectData.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
      whiteboardContent: newProjectData.whiteboardContent || {...DEFAULT_EMPTY_WHITEBOARD_DATA},
    };
    
    const projectDocRef = doc(db, PROJECTS_COLLECTION, newProjectId);
    await setDoc(projectDocRef, projectToCreate);
    console.log(`[FirestoreService] Project "${projectToCreate.name}" (ID: ${newProjectId}) created.`);
    return projectToCreate;
  } catch (error) {
    console.error('[FirestoreService] Error creating project:', error);
    throw error;
  }
}

export async function deleteProjectFromFirestore(projectId: string): Promise<void> {
  console.log(`[FirestoreService] Deleting project: ${projectId}`);
  try {
    const projectDocRef = doc(db, PROJECTS_COLLECTION, projectId);
    await deleteDoc(projectDocRef);
    console.log(`[FirestoreService] Project ${projectId} deleted.`);
  } catch (error) {
    console.error(`[FirestoreService] Error deleting project ${projectId}:`, error);
    throw error;
  }
}
