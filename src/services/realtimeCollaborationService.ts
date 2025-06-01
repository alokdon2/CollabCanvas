
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

// --- Whiteboard Data Point Transformation Helpers ---

/**
 * Transforms an individual Excalidraw element's points for saving or loading.
 * - For 'save': Converts `[[x,y], ...]` to `[{x,y}, ...]`
 * - For 'load': Converts `[{x,y}, ...]` to `[[x,y], ...]`
 */
const transformElementPoints = (element: ExcalidrawElement, direction: 'save' | 'load'): ExcalidrawElement => {
  // Ensure element.points is an array and not empty before processing
  if (!element.points || !Array.isArray(element.points) || element.points.length === 0) {
    return element;
  }

  const newElement = { ...element } as any; // Use 'as any' for flexibility during transformation

  try {
    if (direction === 'save') {
      // Check if points are in number[][] format (Excalidraw's internal format for Point[])
      // e.g., points: [[0,0], [1,1]]
      const firstPoint = element.points[0];
      if (Array.isArray(firstPoint) && firstPoint.length === 2 && typeof firstPoint[0] === 'number' && typeof firstPoint[1] === 'number') {
        newElement.points = (element.points as ReadonlyArray<readonly [number, number]>).map(p => ({ x: p[0], y: p[1] }));
      }
    } else { // direction === 'load'
      // Check if points are in Array<{x,y}> format (Firestore stored format)
      // e.g., points: [{x:0, y:0}, {x:1, y:1}]
      const firstPoint = element.points[0];
      if (typeof firstPoint === 'object' && firstPoint !== null && 'x' in firstPoint && 'y' in firstPoint) {
        newElement.points = (element.points as Array<{x: number, y: number}>).map(p => [p.x, p.y]);
      }
    }
  } catch (error) {
    console.error("Error transforming element points:", error, "Element:", JSON.stringify(element), "Direction:", direction);
    // Return element as is if transformation fails to prevent crashes, data might be malformed
    return element;
  }

  return newElement as ExcalidrawElement;
};

/**
 * Recursively transforms whiteboard data (specifically element points) for saving or loading.
 */
const transformWhiteboardDataPointsRecursive = (whiteboardData: WhiteboardData | null | undefined, direction: 'save' | 'load'): WhiteboardData | null => {
  if (!whiteboardData || !whiteboardData.elements || !Array.isArray(whiteboardData.elements)) {
    return whiteboardData || null;
  }
  try {
    const transformedElements = whiteboardData.elements.map(el => transformElementPoints(el, direction));
    return {
      ...whiteboardData,
      elements: transformedElements,
      // Ensure appState and files are present, even if empty, to match WhiteboardData structure
      appState: whiteboardData.appState || {}, 
      files: whiteboardData.files || {},
    };
  } catch (error) {
    console.error("Error in transformWhiteboardDataPointsRecursive for elements:", error, "WhiteboardData elements:", JSON.stringify(whiteboardData.elements));
    return { // Return a safe default structure
        ...whiteboardData,
        elements: [], // Fallback to empty elements on error
        appState: whiteboardData.appState || {},
        files: whiteboardData.files || {},
    };
  }
};

/**
 * Processes whiteboard content within a project (root and file system nodes)
 * by transforming element points for saving to or loading from Firestore.
 * @param project The project data.
 * @param direction 'save' to convert points to {x,y} objects, 'load' to convert back to [x,y] arrays.
 * @returns The processed project data.
 */
const processProjectWhiteboardData = (project: Project, direction: 'save' | 'load'): Project => {
  const processNodes = (nodes: FileSystemNode[]): FileSystemNode[] => {
    return nodes.map(node => ({
      ...node,
      whiteboardContent: transformWhiteboardDataPointsRecursive(node.whiteboardContent, direction),
      children: node.children ? processNodes(node.children) : undefined,
    }));
  };

  return {
    ...project,
    whiteboardContent: transformWhiteboardDataPointsRecursive(project.whiteboardContent, direction),
    fileSystemRoots: project.fileSystemRoots ? processNodes(project.fileSystemRoots) : [],
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
    
  // Ensure Excalidraw appState.collaborators is serializable (convert Map to object)
  if (data.appState && data.appState.collaborators instanceof Map) {
    const collaboratorsObject: { [key: string]: any } = {};
    for (const [key, value] of data.appState.collaborators.entries()) {
      collaboratorsObject[key] = sanitizeDataForFirestore(value); // Sanitize collaborator data too
    }
    data.appState.collaborators = collaboratorsObject;
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
      projectData = processProjectWhiteboardData(projectData, 'load'); // Transform points on load
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

    projectToProcess = processProjectWhiteboardData(projectToProcess, 'save'); // Transform points for save

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
      updatedProject = processProjectWhiteboardData(updatedProject, 'load'); // Transform points on load
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
const DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT: WhiteboardData = { 
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
    
    // Transform points for each project loaded for the dashboard
    projects = projects.map(p => processProjectWhiteboardData(p, 'load')); 

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

    let projectToCreate: Project = {
      ...newProjectData,
      id: newProjectId,
      createdAt: now,
      updatedAt: now,
      fileSystemRoots: ensureNodeContentDefaults(newProjectData.fileSystemRoots || []),
      textContent: newProjectData.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
      whiteboardContent: newProjectData.whiteboardContent || { ...DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT },
    };

    projectToCreate = processProjectWhiteboardData(projectToCreate, 'save'); // Transform points for save

    const finalProjectToCreateRaw = sanitizeDataForFirestore(projectToCreate);
    const finalProjectToCreate = { 
      ...finalProjectToCreateRaw,
      createdAt: now,
      updatedAt: now,
    };

    const projectDocRef = doc(db, PROJECTS_COLLECTION, newProjectId);
    await setDoc(projectDocRef, finalProjectToCreate);
    console.log(`[FirestoreService] Project "${finalProjectToCreate.name}" (ID: ${newProjectId}) created.`);

    let returnProject = JSON.parse(JSON.stringify(finalProjectToCreate)) as Project;
    returnProject = processProjectWhiteboardData(returnProject, 'load'); // Transform points for client return
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
