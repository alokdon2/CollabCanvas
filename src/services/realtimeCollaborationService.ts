
/**
 * @fileOverview Service for real-time collaboration using Firebase Firestore.
 * Project data (textContent, whiteboardContent, fileSystemRoots) is stored
 * as a JSON string in a 'projectDataBlob' field to handle complex nested structures.
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
  Timestamp, // Keep for potential use if direct Timestamps are ever stored, though unlikely with blob
  where
} from 'firebase/firestore';

const PROJECTS_COLLECTION = 'projects';

const DEFAULT_EMPTY_TEXT_CONTENT = "<p></p>";
const DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT: WhiteboardData = { 
  elements: [],
  appState: { ZenModeEnabled: false, viewModeEnabled: false } as ExcalidrawAppState,
  files: {}
};

// --- Data Transformation Helpers ---

/**
 * Processes Excalidraw whiteboard data for saving to or loading from Firestore.
 * - Converts `points` array format.
 * - Converts `appState.collaborators` Map/Object.
 * @param whiteboardData The whiteboard data to process.
 * @param direction 'save' (to Firestore) or 'load' (from Firestore).
 * @returns Processed whiteboard data or null.
 */
export const processSingleWhiteboardData = (
  whiteboardData: WhiteboardData | null | undefined,
  direction: 'save' | 'load'
): WhiteboardData | null => {
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
          collaboratorsObject[String(key)] = value; // Assuming 'value' is already Firestore-compatible
        });
        newAppState.collaborators = collaboratorsObject;
      }
    }
  }
  
  let transformedElements: readonly ExcalidrawElement[] = whiteboardData.elements || [];
  if (Array.isArray(whiteboardData.elements)) {
      transformedElements = whiteboardData.elements.map(el => {
          if (el && Array.isArray(el.points)) {
              const newPoints = el.points.map((p: any) => {
                  if (direction === 'save' && Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number') {
                      return { x: p[0], y: p[1] }; // Convert [x,y] to {x,y} for save
                  } else if (direction === 'load' && typeof p === 'object' && p !== null && 'x' in p && 'y' in p && typeof p.x === 'number' && typeof p.y === 'number') {
                      return [p.x, p.y]; // Convert {x,y} to [x,y] for load
                  }
                  return p; 
              });
              return { ...el, points: newPoints };
          }
          return el;
      });
  }

  return {
    elements: transformedElements,
    appState: newAppState,
    files: typeof whiteboardData.files === 'object' && whiteboardData.files !== null ? whiteboardData.files : {},
  };
};

/**
 * Recursively processes FileSystemNode array for saving to or loading from Firestore.
 * Applies whiteboard data processing to each node.
 * @param nodes Array of FileSystemNode.
 * @param direction 'save' or 'load'.
 * @returns Processed array of FileSystemNode.
 */
const processFileSystemRootsRecursive = (
  nodes: FileSystemNode[] | undefined,
  direction: 'save' | 'load'
): FileSystemNode[] => {
  if (!nodes) return [];
  return nodes.map(node => ({
    ...node,
    whiteboardContent: processSingleWhiteboardData(node.whiteboardContent, direction),
    children: node.children ? processFileSystemRootsRecursive(node.children, direction) : undefined,
  }));
};


// Helper to convert Firestore Timestamps to ISO strings if they exist
// Note: With blob strategy, this is mainly for top-level createdAt/updatedAt if they were Timestamps.
// We are standardizing on ISO strings, so this might become less necessary.
export const convertTimestampsForClient = (data: any): any => {
  if (data && typeof data === 'object') {
    if (data instanceof Timestamp) {
      return data.toDate().toISOString();
    }
    for (const key in data) {
      if (data[key] instanceof Timestamp) {
        data[key] = data[key].toDate().toISOString();
      } else if (typeof data[key] === 'object') {
        convertTimestampsForClient(data[key]);
      }
    }
  }
  return data;
};

// Helper to sanitize data for Firestore (e.g., remove undefined)
// This is applied BEFORE JSON.stringify
export const sanitizeDataForFirestore = (data: any): any => {
  if (data === undefined) {
    return undefined; // Firestore cannot store undefined. JSON.stringify also removes it.
  }
  if (data === null || typeof data !== 'object' || data instanceof Date || data instanceof Timestamp) { // Date and Timestamp are fine
    return data;
  }
  // Maps should have been converted to objects by processSingleWhiteboardData (for collaborators)
  // If other maps exist, they need explicit conversion. For now, assume this is handled.
  if (data instanceof Map) {
     console.warn("[FirestoreService] SanitizeDataForFirestore encountered a Map. It should have been pre-processed. Converting to object.", data);
     const obj: { [key: string]: any } = {};
     data.forEach((value, key) => {
       const sanitizedValue = sanitizeDataForFirestore(value);
       if (sanitizedValue !== undefined) {
         obj[String(key)] = sanitizedValue;
       }
     });
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

// --- Firestore Document Structure ---
interface ProjectDocument {
  id: string;
  name: string;
  ownerId?: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  projectDataBlob: string; // JSON string of ProjectDataBlobContent
}

interface ProjectDataBlobContent {
  textContent: string;
  whiteboardContent: WhiteboardData | null;
  fileSystemRoots: FileSystemNode[];
}


// --- Service Functions ---

/**
 * Loads project data from Firestore.
 * Parses the projectDataBlob and processes its content.
 * @param projectId The ID of the project to load.
 * @returns A Promise that resolves to the project data or null if not found.
 */
export async function loadProjectData(projectId: string): Promise<Project | null> {
  console.log(`[FirestoreService Blob] Attempting to load project: ${projectId}`);
  try {
    const projectDocRef = doc(db, PROJECTS_COLLECTION, projectId);
    const docSnap = await getDoc(projectDocRef);

    if (docSnap.exists()) {
      const dbData = docSnap.data() as ProjectDocument;
      const projectCoreData: ProjectDataBlobContent = JSON.parse(dbData.projectDataBlob);
      
      const project: Project = {
        id: dbData.id,
        name: dbData.name,
        ownerId: dbData.ownerId,
        createdAt: dbData.createdAt, // Assumed ISO string
        updatedAt: dbData.updatedAt, // Assumed ISO string
        textContent: projectCoreData.textContent,
        whiteboardContent: processSingleWhiteboardData(projectCoreData.whiteboardContent, 'load'),
        fileSystemRoots: processFileSystemRootsRecursive(projectCoreData.fileSystemRoots, 'load'),
      };
      console.log(`[FirestoreService Blob] Project ${projectId} loaded and parsed.`);
      return project;
    } else {
      console.log(`[FirestoreService Blob] Project ${projectId} not found.`);
      return null;
    }
  } catch (error) {
    console.error(`[FirestoreService Blob] Error loading project ${projectId}:`, error);
    throw error;
  }
}

/**
 * Saves project data to Firestore.
 * Stringifies complex data into projectDataBlob.
 * @param project The project data to save.
 */
export async function saveProjectData(project: Project): Promise<void> {
  console.log(`[FirestoreService Blob] Saving project: ${project.id}`);
  try {
    const dataToBlob: ProjectDataBlobContent = {
      textContent: project.textContent,
      whiteboardContent: processSingleWhiteboardData(project.whiteboardContent, 'save'),
      fileSystemRoots: processFileSystemRootsRecursive(project.fileSystemRoots, 'save'),
    };

    const sanitizedBlobContent = sanitizeDataForFirestore(dataToBlob);

    const projectDocForDb: ProjectDocument = {
      id: project.id,
      name: project.name,
      ownerId: project.ownerId,
      createdAt: project.createdAt, // Should be an ISO string
      updatedAt: project.updatedAt, // Should be an ISO string (set by caller before this fn)
      projectDataBlob: JSON.stringify(sanitizedBlobContent),
    };

    const projectDocRef = doc(db, PROJECTS_COLLECTION, project.id);
    await setDoc(projectDocRef, projectDocForDb, { merge: true }); // merge true to be safe if other metadata fields are managed elsewhere
    console.log(`[FirestoreService Blob] Project ${project.id} save initiated to Firestore.`);
  } catch (error) {
    console.error(`[FirestoreService Blob] Error saving project ${project.id}:`, error);
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
  console.log(`[FirestoreService Blob] Subscribing to updates for project: ${projectId}`);
  const projectDocRef = doc(db, PROJECTS_COLLECTION, projectId);

  const unsubscribe = onSnapshot(projectDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const dbData = docSnap.data() as ProjectDocument;
      try {
        const projectCoreData: ProjectDataBlobContent = JSON.parse(dbData.projectDataBlob);
        const updatedProject: Project = {
          id: dbData.id,
          name: dbData.name,
          ownerId: dbData.ownerId,
          createdAt: dbData.createdAt,
          updatedAt: dbData.updatedAt,
          textContent: projectCoreData.textContent,
          whiteboardContent: processSingleWhiteboardData(projectCoreData.whiteboardContent, 'load'),
          fileSystemRoots: processFileSystemRootsRecursive(projectCoreData.fileSystemRoots, 'load'),
        };
        console.log(`[FirestoreService Blob] Real-time update received for project ${projectId}`);
        onUpdateCallback(updatedProject);
      } catch (error) {
        console.error(`[FirestoreService Blob] Error parsing projectDataBlob in subscription for ${projectId}:`, error, dbData.projectDataBlob);
      }
    } else {
      console.log(`[FirestoreService Blob] Real-time update: Project ${projectId} deleted or does not exist.`);
      // Optionally, notify callback about deletion: onUpdateCallback(null as any);
    }
  }, (error) => {
    console.error(`[FirestoreService Blob] Error in real-time subscription for project ${projectId}:`, error);
  });

  return unsubscribe;
}


export async function unsubscribeFromAllProjectUpdates(projectId: string): Promise<void> {
  console.log(`[FirestoreService Blob] UnsubscribeFromAllProjectUpdates called for ${projectId}. Individual listeners should be managed by their onSnapshot unsub function.`);
}


// --- Functions for Dashboard Page ---

export const ensureNodeContentDefaults = (nodes: FileSystemNode[] | undefined): FileSystemNode[] => {
  if (!nodes) return [];
  return nodes.map(node => ({
    id: node.id || crypto.randomUUID(),
    name: node.name || "Untitled Node",
    type: node.type || 'file',
    textContent: node.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
    whiteboardContent: node.whiteboardContent ? {
        elements: node.whiteboardContent.elements || [],
        appState: node.whiteboardContent.appState || { ...DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT.appState } as ExcalidrawAppState,
        files: node.whiteboardContent.files || {},
    } : { ...DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT },
    children: node.children ? ensureNodeContentDefaults(node.children) : [], // Ensure children also have defaults
  }));
};

export async function getAllProjectsFromFirestore(userId?: string): Promise<Project[]> {
  if (!userId) {
    console.log('[FirestoreService Blob] No user ID provided, returning empty project list for dashboard.');
    return [];
  }
  console.log(`[FirestoreService Blob] Fetching projects for dashboard for user: ${userId}`);
  try {
    const projectsColRef = collection(db, PROJECTS_COLLECTION);
    // Note: Firestore cannot order by a field if it also filters by inequality on another.
    // Here, we filter by ownerId (equality) and order by updatedAt. This is fine.
    const q = query(projectsColRef, where("ownerId", "==", userId), orderBy('updatedAt', 'desc'));
    const querySnapshot = await getDocs(q);

    const projects: Project[] = [];
    for (const docSnap of querySnapshot.docs) {
      const dbData = docSnap.data() as ProjectDocument;
      try {
        const projectCoreData: ProjectDataBlobContent = JSON.parse(dbData.projectDataBlob);
        const project: Project = {
          id: dbData.id,
          name: dbData.name,
          ownerId: dbData.ownerId,
          createdAt: dbData.createdAt,
          updatedAt: dbData.updatedAt,
          textContent: projectCoreData.textContent,
          whiteboardContent: processSingleWhiteboardData(projectCoreData.whiteboardContent, 'load'),
          fileSystemRoots: processFileSystemRootsRecursive(projectCoreData.fileSystemRoots, 'load'),
        };
        projects.push(project);
      } catch (error) {
          console.error(`[FirestoreService Blob] Error parsing projectDataBlob for project ${dbData.id} in getAllProjects:`, error, dbData.projectDataBlob);
          // Optionally skip this project or handle error appropriately
      }
    }
    
    console.log(`[FirestoreService Blob] Fetched ${projects.length} projects for user ${userId}.`);
    return projects;
  } catch (error) {
    console.error(`[FirestoreService Blob] Error fetching projects for user ${userId}:`, error);
    throw error;
  }
}

export async function createProjectInFirestore(newProjectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
  console.log('[FirestoreService Blob] Creating new project in Firestore:', newProjectData.name);
  try {
    const newProjectId = crypto.randomUUID();
    const now = new Date().toISOString();

    const initialFileSystemRootsWithDefaults = ensureNodeContentDefaults(newProjectData.fileSystemRoots || []);
    const initialWhiteboardContentWithDefaults = newProjectData.whiteboardContent || { ...DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT };
    const initialTextContentWithDefaults = newProjectData.textContent || DEFAULT_EMPTY_TEXT_CONTENT;


    const dataToBlob: ProjectDataBlobContent = {
      textContent: initialTextContentWithDefaults,
      whiteboardContent: processSingleWhiteboardData(initialWhiteboardContentWithDefaults, 'save'),
      fileSystemRoots: processFileSystemRootsRecursive(initialFileSystemRootsWithDefaults, 'save'),
    };
    const sanitizedBlobContent = sanitizeDataForFirestore(dataToBlob);

    const projectDocForDb: ProjectDocument = {
      id: newProjectId,
      name: newProjectData.name || "Untitled Project",
      ownerId: newProjectData.ownerId,
      createdAt: now,
      updatedAt: now,
      projectDataBlob: JSON.stringify(sanitizedBlobContent),
    };

    const projectDocRef = doc(db, PROJECTS_COLLECTION, newProjectId);
    await setDoc(projectDocRef, projectDocForDb);
    console.log(`[FirestoreService Blob] Project "${projectDocForDb.name}" (ID: ${newProjectId}) created.`);

    // Reconstruct the full project object to return to the client, ensuring it's processed for client use
    const createdProject: Project = {
      id: projectDocForDb.id,
      name: projectDocForDb.name,
      ownerId: projectDocForDb.ownerId,
      createdAt: projectDocForDb.createdAt,
      updatedAt: projectDocForDb.updatedAt,
      textContent: initialTextContentWithDefaults, // Use the original, not from parsed blob for create
      whiteboardContent: processSingleWhiteboardData(initialWhiteboardContentWithDefaults, 'load'), // Re-process for client (Map for collaborators)
      fileSystemRoots: processFileSystemRootsRecursive(initialFileSystemRootsWithDefaults, 'load'), // Re-process for client
    };
    return createdProject;

  } catch (error) {
    console.error('[FirestoreService Blob] Error creating project:', error);
    throw error;
  }
}

export async function deleteProjectFromFirestore(projectId: string): Promise<void> {
  console.log(`[FirestoreService Blob] Deleting project: ${projectId}`);
  try {
    const projectDocRef = doc(db, PROJECTS_COLLECTION, projectId);
    await deleteDoc(projectDocRef);
    console.log(`[FirestoreService Blob] Project ${projectId} deleted.`);
  } catch (error) {
    console.error(`[FirestoreService Blob] Error deleting project ${projectId}:`, error);
    throw error;
  }
}
