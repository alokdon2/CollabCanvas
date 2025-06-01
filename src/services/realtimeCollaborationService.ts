
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

const DEFAULT_EMPTY_TEXT_CONTENT = "<p></p>";
const DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT: WhiteboardData = { 
  elements: [],
  appState: { ZenModeEnabled: false, viewModeEnabled: false } as ExcalidrawAppState,
  files: {}
};


// --- Whiteboard Data Point Transformation Helpers ---
export const processDataObjectWhiteboardContent = (dataObject: Project | FileSystemNode | { whiteboardContent: WhiteboardData | null | undefined }, direction: 'save' | 'load'): any => {
  const transformSingleWhiteboard = (whiteboardData: WhiteboardData | null | undefined): WhiteboardData | null => {
    if (!whiteboardData) {
      return null;
    }

    let newAppState = whiteboardData.appState
      ? { ...whiteboardData.appState }
      : ({ ZenModeEnabled: false, viewModeEnabled: false } as ExcalidrawAppState);

    // Handle 'collaborators' Map/Object conversion
    if (newAppState && newAppState.hasOwnProperty('collaborators')) {
      const collaboratorsData = newAppState.collaborators;
      if (direction === 'load') {
        if (collaboratorsData && typeof collaboratorsData === 'object' && !(collaboratorsData instanceof Map)) {
          const collaboratorsMap = new Map();
          for (const key in collaboratorsData as any) {
            if (Object.prototype.hasOwnProperty.call(collaboratorsData, key)) {
              collaboratorsMap.set(key, (collaboratorsData as any)[key]);
            }
          }
          newAppState.collaborators = collaboratorsMap;
        } else if (collaboratorsData === null || collaboratorsData === undefined) {
          newAppState.collaborators = new Map();
        }
      } else { // direction === 'save'
        if (newAppState.collaborators instanceof Map) {
          const collaboratorsObject: { [key: string]: any } = {};
          newAppState.collaborators.forEach((value, key) => {
            collaboratorsObject[String(key)] = sanitizeDataForFirestore(value); 
          });
          newAppState.collaborators = collaboratorsObject;
        }
      }
    }
    
    let transformedElements = whiteboardData.elements;
    if (Array.isArray(whiteboardData.elements)) {
        transformedElements = whiteboardData.elements.map(el => {
            if (el && Array.isArray(el.points)) {
                const newPoints = el.points.map(p => {
                    if (direction === 'save' && Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number') {
                        return { x: p[0], y: p[1] };
                    } else if (direction === 'load' && typeof p === 'object' && p !== null && 'x' in p && 'y' in p && typeof p.x === 'number' && typeof p.y === 'number') {
                        return [p.x, p.y];
                    }
                    return p; // Return as is if no transformation needed or format unexpected
                });
                return { ...el, points: newPoints };
            }
            return el;
        });
    }


    return {
      ...whiteboardData,
      elements: transformedElements || [],
      appState: newAppState,
      files: typeof whiteboardData.files === 'object' && whiteboardData.files !== null ? whiteboardData.files : {},
    };
  };
  
  if ('whiteboardContent' in dataObject && !('id' in dataObject || 'fileSystemRoots' in dataObject || 'type' in dataObject)) {
    return {
        whiteboardContent: transformSingleWhiteboard(dataObject.whiteboardContent)
    };
  }

  if ('fileSystemRoots' in dataObject) { // It's a Project
    const project = dataObject as Project;
    const processNodes = (nodes: FileSystemNode[]): FileSystemNode[] => {
      return nodes.map(node => ({
        ...node,
        whiteboardContent: transformSingleWhiteboard(node.whiteboardContent),
        children: node.children ? processNodes(node.children) : undefined,
      }));
    };
    return {
      ...project,
      whiteboardContent: transformSingleWhiteboard(project.whiteboardContent),
      fileSystemRoots: project.fileSystemRoots ? processNodes(project.fileSystemRoots) : [],
    };
  } else { // It's a FileSystemNode
    const node = dataObject as FileSystemNode;
    return {
      ...node,
      whiteboardContent: transformSingleWhiteboard(node.whiteboardContent),
      children: node.children ? node.children.map(child => processDataObjectWhiteboardContent(child, direction) as FileSystemNode) : undefined,
    };
  }
};


// Helper to convert Firestore Timestamps to ISO strings if they exist
export const convertTimestamps = (data: any): any => {
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
export const sanitizeDataForFirestore = (data: any): any => {
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
      // Client (ProjectPage) will call processDataObjectWhiteboardContent(projectData, 'load')
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
    let projectToProcess = JSON.parse(JSON.stringify(project)); 
    projectToProcess = processDataObjectWhiteboardContent(projectToProcess, 'save') as Project;
    const finalProjectToSaveRaw = sanitizeDataForFirestore(projectToProcess);

    const finalProjectToSave = {
        ...finalProjectToSaveRaw,
        // updatedAt is typically set by the caller (ProjectPage) before calling saveProjectData
    };

    const projectDocRef = doc(db, PROJECTS_COLLECTION, project.id);
    await setDoc(projectDocRef, finalProjectToSave, { merge: true });
    console.log(`[FirestoreService] Project ${project.id} save initiated to Firestore.`);
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
      // Client (ProjectPage) will call processDataObjectWhiteboardContent(updatedProject, 'load')
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

export const ensureNodeContentDefaults = (nodes: FileSystemNode[]): FileSystemNode[] => {
  return nodes.map(node => ({
    ...node,
    name: node.name || "Untitled Node",
    textContent: node.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
    whiteboardContent: node.whiteboardContent ? {
        elements: node.whiteboardContent.elements || [],
        appState: node.whiteboardContent.appState || { ...DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT.appState } as ExcalidrawAppState,
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
    let projects = querySnapshot.docs.map(docSnap => {
        let project = convertTimestamps(docSnap.data()) as Project;
        // Client (DashboardPage) will call processDataObjectWhiteboardContent(..., 'load')
        // and ensureNodeContentDefaults after fetching
        return project;
    });
    
    console.log(`[FirestoreService] Fetched ${projects.length} projects for user ${userId}.`);
    return projects;
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

    const projectWithClientDefaults: Project = {
      ...newProjectData,
      id: newProjectId,
      createdAt: now,
      updatedAt: now,
      name: newProjectData.name || "Untitled Project",
      fileSystemRoots: ensureNodeContentDefaults(newProjectData.fileSystemRoots || []),
      textContent: newProjectData.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
      whiteboardContent: newProjectData.whiteboardContent || { ...DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT },
    };
    
    let projectToSaveProcessed = processDataObjectWhiteboardContent(projectWithClientDefaults, 'save') as Project;
    const finalProjectToSaveSanitized = sanitizeDataForFirestore(projectToSaveProcessed);

    const finalProjectToSave = { 
      ...finalProjectToSaveSanitized,
      createdAt: now, 
      updatedAt: now,
    };

    const projectDocRef = doc(db, PROJECTS_COLLECTION, newProjectId);
    await setDoc(projectDocRef, finalProjectToSave);
    console.log(`[FirestoreService] Project "${finalProjectToSave.name}" (ID: ${newProjectId}) created.`);

    // Client will call processDataObjectWhiteboardContent(..., 'load') on this returned object
    return JSON.parse(JSON.stringify(finalProjectToSave)) as Project;
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
