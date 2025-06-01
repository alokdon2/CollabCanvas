
/**
 * @fileOverview Service for real-time collaboration using Firebase Firestore.
 */
import { db } from '@/lib/firebase';
import type { Project, FileSystemNode, WhiteboardData, ExcalidrawAppState, ExcalidrawElement } from '@/lib/types';
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
  Timestamp,
  DocumentReference,
  where
} from 'firebase/firestore';

const PROJECTS_COLLECTION = 'projects';

// --- Whiteboard Data Transformation Helpers (Stringification Approach) ---

/**
 * Converts WhiteboardData.elements to a JSON string for saving to Firestore.
 * The rest of the WhiteboardData (appState, files) is returned as is.
 */
const convertWhiteboardElementsToString = (whiteboardData: WhiteboardData | null | undefined): any | null => {
  if (!whiteboardData) return null;
  // Create a shallow copy to avoid mutating the original object in state directly
  const processedData = { ...whiteboardData };
  if (processedData.elements && Array.isArray(processedData.elements)) {
    (processedData as any).elementsString = JSON.stringify(processedData.elements);
    delete (processedData as any).elements; // Remove the original elements array
  }
  return processedData;
};

/**
 * Parses elementsString from Firestore data back into WhiteboardData.elements.
 * Ensures appState exists.
 */
const parseWhiteboardElementsFromString = (firestoreData: any | null | undefined): WhiteboardData | null => {
  if (!firestoreData) return null;
  // Create a shallow copy
  const rehydratedData = { ...firestoreData };
  if (rehydratedData.elementsString && typeof rehydratedData.elementsString === 'string') {
    try {
      rehydratedData.elements = JSON.parse(rehydratedData.elementsString);
    } catch (e) {
      console.error("Failed to parse elementsString from Firestore:", e, rehydratedData.elementsString);
      rehydratedData.elements = []; // Default to empty array on error
    }
    delete rehydratedData.elementsString;
  } else if (!rehydratedData.elements) {
    // If elementsString is not present and elements is also not present, ensure elements is an empty array.
     rehydratedData.elements = [];
  }

  // Ensure appState is at least an empty object if not present
  if (!rehydratedData.appState) {
      rehydratedData.appState = {};
  }
  // Ensure files is at least an empty object if not present
  if (!rehydratedData.files) {
      rehydratedData.files = {};
  }
  return rehydratedData as WhiteboardData;
};

/**
 * Processes whiteboard content within a project (root and file system nodes)
 * for saving to or loading from Firestore.
 * @param project The project data.
 * @param direction 'save' to convert elements to string, 'load' to parse string to elements.
 * @returns The processed project data.
 */
const processProjectWhiteboardData = (project: Project, direction: 'save' | 'load'): Project => {
  const whiteboardProcessor = direction === 'save' ? convertWhiteboardElementsToString : parseWhiteboardElementsFromString;

  const processNodes = (nodes: FileSystemNode[]): FileSystemNode[] => {
    return nodes.map(node => ({
      ...node,
      whiteboardContent: whiteboardProcessor(node.whiteboardContent),
      children: node.children ? processNodes(node.children) : undefined,
    }));
  };

  return {
    ...project,
    whiteboardContent: whiteboardProcessor(project.whiteboardContent),
    fileSystemRoots: processNodes(project.fileSystemRoots || []),
  };
};


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

// Helper to sanitize data for Firestore (e.g., convert Maps to Objects, remove undefined, handle DocumentReferences)
const sanitizeDataForFirestore = (data: any): any => {
  if (data instanceof DocumentReference) {
    console.warn("[FirestoreService] Found DocumentReference in data to be saved. Removing it to prevent error. Path:", data.path);
    return undefined;
  }
  if (data === undefined) {
    return undefined;
  }

  if (data === null || typeof data !== 'object' || data instanceof Timestamp || data instanceof Date) {
    return data;
  }

  if (data instanceof Map) {
    const obj: { [key: string]: any } = {};
    for (const [key, value] of data.entries()) {
      const sanitizedValue = sanitizeDataForFirestore(value);
      if (sanitizedValue !== undefined) {
        obj[String(key)] = sanitizedValue;
      }
    }
    return obj;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeDataForFirestore(item)).filter(item => item !== undefined);
  }

  const sanitizedObject: { [key: string]: any } = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];
      const sanitizedValue = sanitizeDataForFirestore(value);
      if (sanitizedValue !== undefined) {
        sanitizedObject[key] = sanitizedValue;
      }
    }
  }
  return sanitizedObject;
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
      let projectData = convertTimestamps(docSnap.data()) as Project;
      projectData = processProjectWhiteboardData(projectData, 'load');
      return projectData;
    } else {
      console.log(`[FirestoreService] Project ${projectId} not found.`);
      return null;
    }
  } catch (error) {
    console.error(`[FirestoreService] Error loading project ${projectId}:`, error);
    throw error;
  }
}

/**
 * Saves project data to Firestore.
 * @param project The project data to save.
 */
export async function saveProjectData(project: Project): Promise<void> {
  console.log(`[FirestoreService] Saving project: ${project.id}`);
  try {
    // Deep clone to avoid mutating original state object before processing
    let projectToProcess = JSON.parse(JSON.stringify(project));

    projectToProcess = processProjectWhiteboardData(projectToProcess, 'save');

    const finalProjectToSaveRaw = sanitizeDataForFirestore(projectToProcess);

    const finalProjectToSave = {
        ...finalProjectToSaveRaw,
        updatedAt: new Date().toISOString(), // Ensure updatedAt is always fresh
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
      let updatedProject = convertTimestamps(docSnap.data()) as Project;
      updatedProject = processProjectWhiteboardData(updatedProject, 'load');
      onUpdateCallback(updatedProject);
    } else {
      console.log(`[FirestoreService] Real-time update: Project ${projectId} deleted or does not exist.`);
    }
  }, (error) => {
    console.error(`[FirestoreService] Error in real-time subscription for project ${projectId}:`, error);
  });

  return unsubscribe;
}


export async function unsubscribeFromAllProjectUpdates(projectId: string): Promise<void> {
  console.log(`[FirestoreService] UnsubscribeFromAllProjectUpdates called for ${projectId}. Individual listeners should be managed by their onSnapshot unsub function.`);
}


// --- Functions for Dashboard Page ---

const DEFAULT_EMPTY_TEXT_CONTENT = "<p></p>";
const DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT: WhiteboardData = { // Renamed to avoid conflict
  elements: [],
  appState: { ZenModeEnabled: false, viewModeEnabled: false } as ExcalidrawAppState,
  files: {}
};

const ensureNodeContentDefaults = (nodes: FileSystemNode[]): FileSystemNode[] => {
  return nodes.map(node => ({
    ...node,
    textContent: node.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
    whiteboardContent: node.whiteboardContent ? {
        elements: node.whiteboardContent.elements || [],
        appState: node.whiteboardContent.appState || { ZenModeEnabled: false, viewModeEnabled: false },
        files: node.whiteboardContent.files || {},
    } : { ...DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT },
    ...(node.children && { children: ensureNodeContentDefaults(node.children) }),
  }));
};

export async function getAllProjectsFromFirestore(userId?: string): Promise<Project[]> {
  if (!userId) {
    console.log('[FirestoreService] No user ID provided, returning empty project list for dashboard.');
    return [];
  }
  console.log(`[FirestoreService] Fetching projects for dashboard for user: ${userId}`);
  try {
    const projectsColRef = collection(db, PROJECTS_COLLECTION);
    const q = query(projectsColRef, where("ownerId", "==", userId), orderBy('updatedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    let projects = querySnapshot.docs.map(docSnap => convertTimestamps(docSnap.data()) as Project);
    projects = projects.map(p => processProjectWhiteboardData(p, 'load')); // Load transformation

    console.log(`[FirestoreService] Fetched ${projects.length} projects for user ${userId}.`);
    // This default filling is for client-side representation after load
    return projects.map(p => ({
      ...p,
      textContent: p.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
      whiteboardContent: p.whiteboardContent || { ...DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT },
      fileSystemRoots: ensureNodeContentDefaults(p.fileSystemRoots || [])
    }));
  } catch (error) {
    console.error(`[FirestoreService] Error fetching projects for user ${userId}:`, error);
    throw error;
  }
}

export async function createProjectInFirestore(newProjectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
  console.log('[FirestoreService] Creating new project in Firestore:', newProjectData.name);
  try {
    const newProjectId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Ensure initial structure for a new project before 'save' transformation
    let projectToCreate: Project = {
      ...newProjectData,
      id: newProjectId,
      createdAt: now,
      updatedAt: now,
      fileSystemRoots: ensureNodeContentDefaults(newProjectData.fileSystemRoots || []),
      textContent: newProjectData.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
      whiteboardContent: newProjectData.whiteboardContent || { ...DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT },
    };

    projectToCreate = processProjectWhiteboardData(projectToCreate, 'save'); // Save transformation

    const finalProjectToCreateRaw = sanitizeDataForFirestore(projectToCreate);
    const finalProjectToCreate = { // Ensure timestamps are strings for Firestore
      ...finalProjectToCreateRaw,
      createdAt: now,
      updatedAt: now,
    };

    const projectDocRef = doc(db, PROJECTS_COLLECTION, newProjectId);
    await setDoc(projectDocRef, finalProjectToCreate);
    console.log(`[FirestoreService] Project "${finalProjectToCreate.name}" (ID: ${newProjectId}) created.`);

    // For returning to the client, rehydrate it
    let returnProject = JSON.parse(JSON.stringify(finalProjectToCreate)) as Project;
    returnProject = processProjectWhiteboardData(returnProject, 'load'); // Load transformation for client
    return returnProject;
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
