
/**
 * @fileOverview Service for real-time collaboration using Firebase Firestore.
 */
import { db } from '@/lib/firebase';
import type { Project, FileSystemNode, WhiteboardData, ExcalidrawAppState } from '@/lib/types';
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
  // serverTimestamp, // Can be used if storing native Firestore timestamps
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

// Helper to sanitize data for Firestore (e.g., convert Maps to Objects)
const sanitizeDataForFirestore = (data: any): any => {
  if (data instanceof Map) {
    return Object.fromEntries(data);
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeDataForFirestore(item));
  }
  if (data && typeof data === 'object' && !(data instanceof Timestamp) && !(data instanceof Date) ) {
    const sanitizedObject: { [key: string]: any } = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        sanitizedObject[key] = sanitizeDataForFirestore(data[key]);
      }
    }
    return sanitizedObject;
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
    // Deep clone and sanitize project data before saving
    const projectToSave = JSON.parse(JSON.stringify(project)); // Simple deep clone for POJOs

    // Specifically handle whiteboardContent.appState.collaborators if it's a Map
    if (projectToSave.whiteboardContent && projectToSave.whiteboardContent.appState && project.whiteboardContent?.appState?.collaborators instanceof Map) {
      // If collaborators is a Map in the original project, convert it to an object for Firestore
      projectToSave.whiteboardContent.appState.collaborators = Object.fromEntries(project.whiteboardContent.appState.collaborators);
    } else if (projectToSave.whiteboardContent && projectToSave.whiteboardContent.appState && projectToSave.whiteboardContent.appState.collaborators && typeof projectToSave.whiteboardContent.appState.collaborators === 'object' && !(projectToSave.whiteboardContent.appState.collaborators instanceof Map) ) {
        // It's already an object (likely from JSON.parse or previous sanitization), so it's fine.
    } else if (projectToSave.whiteboardContent && projectToSave.whiteboardContent.appState) {
      // If collaborators field is not a Map or a plain object (e.g. null, undefined), ensure it's not problematic for Firestore
      // Setting to null or deleting is an option if it's not needed for persistence.
      // For Excalidraw, if you don't manage collaborators this way, it's often safe to remove/nullify
       delete projectToSave.whiteboardContent.appState.collaborators;
    }
    
    const finalProjectToSave = {
      ...sanitizeDataForFirestore(projectToSave), // General sanitization
      updatedAt: new Date().toISOString(), // Ensure updatedAt is current
    };
    
    const projectDocRef = doc(db, PROJECTS_COLLECTION, project.id);
    await setDoc(projectDocRef, finalProjectToSave, { merge: true }); 
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
  appState: { ZenModeEnabled: false, viewModeEnabled: false } as ExcalidrawAppState, // Ensure appState is defined
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
    
    let projectToCreate: Project = {
      ...newProjectData,
      id: newProjectId,
      createdAt: now,
      updatedAt: now,
      fileSystemRoots: ensureNodeContentDefaults(newProjectData.fileSystemRoots || []),
      textContent: newProjectData.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
      whiteboardContent: newProjectData.whiteboardContent || {...DEFAULT_EMPTY_WHITEBOARD_DATA},
    };

    // Sanitize before initial creation
    if (projectToCreate.whiteboardContent && projectToCreate.whiteboardContent.appState && projectToCreate.whiteboardContent.appState.collaborators) {
        delete projectToCreate.whiteboardContent.appState.collaborators;
    }
    
    const finalProjectToCreate = sanitizeDataForFirestore(projectToCreate);
    
    const projectDocRef = doc(db, PROJECTS_COLLECTION, newProjectId);
    await setDoc(projectDocRef, finalProjectToCreate);
    console.log(`[FirestoreService] Project "${finalProjectToCreate.name}" (ID: ${newProjectId}) created.`);
    return finalProjectToCreate as Project; // Cast back after sanitization for return type consistency
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
