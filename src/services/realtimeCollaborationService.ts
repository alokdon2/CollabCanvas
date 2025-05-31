
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
  DocumentReference // Added DocumentReference import
} from 'firebase/firestore';

const PROJECTS_COLLECTION = 'projects';

// --- Points Transformation Helpers ---
const transformExcalidrawPointsForSave = (elements: readonly ExcalidrawElement[] | undefined): ExcalidrawElement[] => {
  if (!elements) return [];
  return elements.map(el => {
    if (el && Array.isArray(el.points)) {
      const firstPoint = el.points[0];
      if (Array.isArray(firstPoint) && firstPoint.length === 2 && typeof firstPoint[0] === 'number' && typeof firstPoint[1] === 'number') {
        return {
          ...el,
          points: el.points.map(p => ({ x: (p as [number,number])[0], y: (p as [number,number])[1] })),
        } as ExcalidrawElement; 
      }
    }
    return el;
  });
};

const transformExcalidrawPointsOnLoad = (elements: readonly ExcalidrawElement[] | undefined): ExcalidrawElement[] => {
  if (!elements) return [];
  return elements.map(el => {
    if (el && Array.isArray(el.points)) {
      const firstPoint = el.points[0];
      if (typeof firstPoint === 'object' && firstPoint !== null && 'x' in firstPoint && 'y' in firstPoint) {
        return {
          ...el,
          points: el.points.map(p => [(p as {x:number,y:number}).x, (p as {x:number,y:number}).y]),
        } as ExcalidrawElement; 
      }
    }
    return el;
  });
};

const transformWhiteboardDataPoints = (
  whiteboardData: WhiteboardData | null | undefined,
  transformer: (elements: readonly ExcalidrawElement[] | undefined) => ExcalidrawElement[]
): WhiteboardData | null => {
  if (!whiteboardData) return null;
  return {
    ...whiteboardData,
    elements: transformer(whiteboardData.elements),
  };
};

const transformProjectPoints = (
  project: Project,
  transformer: (elements: readonly ExcalidrawElement[] | undefined) => ExcalidrawElement[]
): Project => {
  const transformNodes = (nodes: FileSystemNode[]): FileSystemNode[] => {
    return nodes.map(node => ({
      ...node,
      whiteboardContent: transformWhiteboardDataPoints(node.whiteboardContent, transformer),
      children: node.children ? transformNodes(node.children) : undefined,
    }));
  };

  return {
    ...project,
    whiteboardContent: transformWhiteboardDataPoints(project.whiteboardContent, transformer),
    fileSystemRoots: transformNodes(project.fileSystemRoots || []),
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
  if (data === undefined) {
    return undefined; // Omit keys with undefined values
  }
  // Check for DocumentReference BEFORE other object/array checks to prevent it from being processed as a generic object
  if (data instanceof DocumentReference) {
    console.warn("[FirestoreService] Found DocumentReference in data to be saved. Removing it to prevent error. Path:", data.path);
    return undefined; // Remove the field by returning undefined. Or consider `return data.path;` to store path as string.
  }

  if (data === null || typeof data !== 'object' || data instanceof Timestamp || data instanceof Date) {
    return data;
  }

  if (data instanceof Map) {
    const obj: { [key: string]: any } = {};
    for (const [key, value] of data.entries()) {
      const sanitizedValue = sanitizeDataForFirestore(value);
      if (sanitizedValue !== undefined) {
        obj[String(key)] = sanitizedValue; // Ensure key is string
      }
    }
    // Handle Excalidraw's collaborators Map specifically if it was converted to an object
    if (obj.hasOwnProperty('collaborators') && typeof obj.collaborators === 'object' && !(obj.collaborators instanceof Map) && obj.collaborators !== null) {
        console.log("[FirestoreService] Sanitizing collaborators object (was Map) before save.");
        // It's already an object here due to Map conversion, ensure its values are sanitized
        // No specific action needed here for collaborators IF it was already converted to object by Map processing
    }
    return obj;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeDataForFirestore(item)).filter(item => item !== undefined);
  }

  // Generic object processing
  const sanitizedObject: { [key: string]: any } = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];
      // Handle Excalidraw's appState.collaborators which is a Map
      if (key === 'collaborators' && value instanceof Map) {
          console.log("[FirestoreService] Converting collaborators Map to object for save.");
          sanitizedObject[key] = sanitizeDataForFirestore(Object.fromEntries(value)); // Convert Map to object and sanitize its content
      } else {
          const sanitizedValue = sanitizeDataForFirestore(value);
          if (sanitizedValue !== undefined) {
            sanitizedObject[key] = sanitizedValue;
          }
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
      projectData = transformProjectPoints(projectData, transformExcalidrawPointsOnLoad);
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
    let projectToSave = JSON.parse(JSON.stringify(project)); 

    projectToSave = transformProjectPoints(projectToSave, transformExcalidrawPointsForSave);
    
    // Sanitize the entire project object for Firestore compatibility
    const finalProjectToSaveRaw = sanitizeDataForFirestore(projectToSave);
    
    const finalProjectToSave = {
        ...finalProjectToSaveRaw, // Spread the sanitized data
        updatedAt: new Date().toISOString(), // Ensure updatedAt is always set/overwritten
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
      updatedProject = transformProjectPoints(updatedProject, transformExcalidrawPointsOnLoad);
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
const DEFAULT_EMPTY_WHITEBOARD_DATA: WhiteboardData = {
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
    } : { ...DEFAULT_EMPTY_WHITEBOARD_DATA },
    ...(node.children && { children: ensureNodeContentDefaults(node.children) }),
  }));
};

export async function getAllProjectsFromFirestore(): Promise<Project[]> {
  console.log('[FirestoreService] Fetching all projects for dashboard');
  try {
    const projectsColRef = collection(db, PROJECTS_COLLECTION);
    const q = query(projectsColRef, orderBy('updatedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    let projects = querySnapshot.docs.map(docSnap => convertTimestamps(docSnap.data()) as Project);
    projects = projects.map(p => transformProjectPoints(p, transformExcalidrawPointsOnLoad));
    
    console.log(`[FirestoreService] Fetched ${projects.length} projects.`);
    return projects.map(p => ({ 
      ...p,
      textContent: p.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
      whiteboardContent: p.whiteboardContent ? {
          elements: p.whiteboardContent.elements || [],
          appState: p.whiteboardContent.appState || { ZenModeEnabled: false, viewModeEnabled: false },
          files: p.whiteboardContent.files || {},
      } : { ...DEFAULT_EMPTY_WHITEBOARD_DATA },
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
      whiteboardContent: newProjectData.whiteboardContent ? {
        elements: newProjectData.whiteboardContent.elements || [],
        appState: newProjectData.whiteboardContent.appState || { ZenModeEnabled: false, viewModeEnabled: false },
        files: newProjectData.whiteboardContent.files || {},
      } : {...DEFAULT_EMPTY_WHITEBOARD_DATA},
    };

    projectToCreate = transformProjectPoints(projectToCreate, transformExcalidrawPointsForSave);
        
    const finalProjectToCreateRaw = sanitizeDataForFirestore(projectToCreate);
    const finalProjectToCreate = {
      ...finalProjectToCreateRaw, // Spread the sanitized data
      createdAt: now, // Ensure timestamps are part of the sanitized object
      updatedAt: now,
    };
    
    const projectDocRef = doc(db, PROJECTS_COLLECTION, newProjectId);
    await setDoc(projectDocRef, finalProjectToCreate);
    console.log(`[FirestoreService] Project "${finalProjectToCreate.name}" (ID: ${newProjectId}) created.`);
    
    let returnProject = JSON.parse(JSON.stringify(finalProjectToCreate)) as Project;
    returnProject = transformProjectPoints(returnProject, transformExcalidrawPointsOnLoad);
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

    
