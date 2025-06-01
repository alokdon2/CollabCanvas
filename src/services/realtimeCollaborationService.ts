
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
  Timestamp,
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
          collaboratorsObject[String(key)] = value;
        });
        newAppState.collaborators = collaboratorsObject;
      }
    }
  }

  let transformedElements: readonly ExcalidrawElement[] = whiteboardData.elements || [];
  if (Array.isArray(whiteboardData.elements)) {
    transformedElements = whiteboardData.elements.map(el => {
      if (el && el.hasOwnProperty('points') && Array.isArray(el.points)) {
        const newPoints = el.points.map((p: any) => {
          if (direction === 'save' && Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number') {
            // Check if already in {x,y} format to prevent re-processing
            if (p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number') {
               return { x: p[0], y: p[1] }; // Convert [x,y] to {x,y} for save
            }
            return p; // Already in {x,y} or other format
          } else if (direction === 'load' && typeof p === 'object' && p !== null && 'x' in p && 'y' in p && typeof p.x === 'number' && typeof p.y === 'number') {
             // Check if already in [x,y] format to prevent re-processing
            if (typeof p.x === 'number' && typeof p.y === 'number') {
              return [p.x, p.y]; // Convert {x,y} to [x,y] for load
            }
            return p; // Already in [x,y] or other format
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

export const convertTimestampsForClient = (data: any): any => {
  if (data && typeof data === 'object') {
    if (data instanceof Timestamp) {
      return data.toDate().toISOString();
    }
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        if (data[key] instanceof Timestamp) {
          data[key] = data[key].toDate().toISOString();
        } else if (typeof data[key] === 'object') {
          convertTimestampsForClient(data[key]);
        }
      }
    }
  }
  return data;
};

export const sanitizeDataForFirestore = (data: any): any => {
  if (data === undefined) {
    return null; // Convert undefined to null for Firestore
  }
  if (data === null || typeof data !== 'object' || data instanceof Date || data instanceof Timestamp) {
    return data;
  }
  if (data instanceof Map) {
     const obj: { [key: string]: any } = {};
     data.forEach((value, key) => {
       const sanitizedValue = sanitizeDataForFirestore(value);
       obj[String(key)] = sanitizedValue; // Store null if value was undefined
     });
     return obj;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeDataForFirestore(item));
  }
  const sanitizedObject: { [key: string]: any } = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];
      sanitizedObject[key] = sanitizeDataForFirestore(value); // Store null if value was undefined
    }
  }
  return sanitizedObject;
};

interface ProjectDocument {
  id: string;
  name: string;
  ownerId?: string | null; // ownerId can be null
  createdAt: string;
  updatedAt: string;
  projectDataBlob: string;
}

interface ProjectDataBlobContent {
  textContent: string;
  whiteboardContent: WhiteboardData | null;
  fileSystemRoots: FileSystemNode[];
}

export async function loadProjectData(projectId: string): Promise<Project | null> {
  console.log(`[FirestoreService Blob] Attempting to load project: ${projectId}`);
  try {
    const projectDocRef = doc(db, PROJECTS_COLLECTION, projectId);
    const docSnap = await getDoc(projectDocRef);

    if (docSnap.exists()) {
      const dbData = docSnap.data() as ProjectDocument;
      let projectCoreData: ProjectDataBlobContent;

      if (dbData.projectDataBlob && typeof dbData.projectDataBlob === 'string') {
        try {
          projectCoreData = JSON.parse(dbData.projectDataBlob);
        } catch (e) {
          console.error(`[FirestoreService Blob] Error parsing projectDataBlob for project ${dbData.id} in loadProjectData:`, e, "Blob content:", dbData.projectDataBlob);
          projectCoreData = {
            textContent: DEFAULT_EMPTY_TEXT_CONTENT,
            whiteboardContent: { ...DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT },
            fileSystemRoots: [],
          };
        }
      } else {
        console.warn(`[FirestoreService Blob] projectDataBlob for project ${dbData.id} in loadProjectData is missing or not a string. Using default empty data. Blob was:`, dbData.projectDataBlob);
        projectCoreData = {
          textContent: DEFAULT_EMPTY_TEXT_CONTENT,
          whiteboardContent: { ...DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT },
          fileSystemRoots: [],
        };
      }

      const project: Project = {
        id: dbData.id,
        name: dbData.name,
        ownerId: dbData.ownerId || undefined, // Convert null to undefined for client consistency if needed
        createdAt: dbData.createdAt,
        updatedAt: dbData.updatedAt,
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
      ownerId: project.ownerId || null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      projectDataBlob: JSON.stringify(sanitizedBlobContent || {}), // Ensure always stringify an object
    };

    const projectDocRef = doc(db, PROJECTS_COLLECTION, project.id);
    await setDoc(projectDocRef, projectDocForDb, { merge: true });
    console.log(`[FirestoreService Blob] Project ${project.id} save initiated to Firestore.`);
  } catch (error) {
    console.error(`[FirestoreService Blob] Error saving project ${project.id}:`, error);
    throw error;
  }
}

export async function subscribeToProjectUpdates(
  projectId: string,
  onUpdateCallback: (updatedProject: Project) => void
): Promise<() => void> {
  console.log(`[FirestoreService Blob] Subscribing to updates for project: ${projectId}`);
  const projectDocRef = doc(db, PROJECTS_COLLECTION, projectId);

  const unsubscribe = onSnapshot(projectDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const dbData = docSnap.data() as ProjectDocument;
      let projectCoreData: ProjectDataBlobContent;

      if (dbData.projectDataBlob && typeof dbData.projectDataBlob === 'string') {
        try {
          projectCoreData = JSON.parse(dbData.projectDataBlob);
        } catch (error) {
          console.error(`[FirestoreService Blob] Error parsing projectDataBlob in subscription for ${dbData.id}:`, error, "Blob content:", dbData.projectDataBlob);
          projectCoreData = {
            textContent: DEFAULT_EMPTY_TEXT_CONTENT,
            whiteboardContent: { ...DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT },
            fileSystemRoots: [],
          };
        }
      } else {
        console.warn(`[FirestoreService Blob] projectDataBlob for project ${dbData.id} in subscription is missing or not a string. Using default. Blob was:`, dbData.projectDataBlob);
        projectCoreData = {
          textContent: DEFAULT_EMPTY_TEXT_CONTENT,
          whiteboardContent: { ...DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT },
          fileSystemRoots: [],
        };
      }

      const updatedProject: Project = {
        id: dbData.id,
        name: dbData.name,
        ownerId: dbData.ownerId || undefined,
        createdAt: dbData.createdAt,
        updatedAt: dbData.updatedAt,
        textContent: projectCoreData.textContent,
        whiteboardContent: processSingleWhiteboardData(projectCoreData.whiteboardContent, 'load'),
        fileSystemRoots: processFileSystemRootsRecursive(projectCoreData.fileSystemRoots, 'load'),
      };
      console.log(`[FirestoreService Blob] Real-time update received for project ${projectId}`);
      onUpdateCallback(updatedProject);

    } else {
      console.log(`[FirestoreService Blob] Real-time update: Project ${projectId} deleted or does not exist.`);
    }
  }, (error) => {
    console.error(`[FirestoreService Blob] Error in real-time subscription for project ${projectId}:`, error);
  });

  return unsubscribe;
}


export async function unsubscribeFromAllProjectUpdates(projectId: string): Promise<void> {
  console.log(`[FirestoreService Blob] UnsubscribeFromAllProjectUpdates called for ${projectId}. Individual listeners should be managed by their onSnapshot unsub function.`);
}

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
    children: node.children ? ensureNodeContentDefaults(node.children) : [],
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
    const q = query(projectsColRef, where("ownerId", "==", userId), orderBy('updatedAt', 'desc'));
    const querySnapshot = await getDocs(q);

    const projects: Project[] = [];
    for (const docSnap of querySnapshot.docs) {
      const dbData = docSnap.data() as ProjectDocument;
      let projectCoreData: ProjectDataBlobContent;

      if (dbData.projectDataBlob && typeof dbData.projectDataBlob === 'string') {
        try {
          projectCoreData = JSON.parse(dbData.projectDataBlob);
        } catch (error) {
          console.error(`[FirestoreService Blob] Error parsing projectDataBlob for project ${dbData.id} in getAllProjects:`, error, "Blob content:", dbData.projectDataBlob);
          projectCoreData = {
            textContent: DEFAULT_EMPTY_TEXT_CONTENT,
            whiteboardContent: { ...DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT },
            fileSystemRoots: [],
          };
        }
      } else {
        console.warn(`[FirestoreService Blob] projectDataBlob for project ${dbData.id} in getAllProjects is missing or not a string. Using default. Blob was:`, dbData.projectDataBlob);
        projectCoreData = {
          textContent: DEFAULT_EMPTY_TEXT_CONTENT,
          whiteboardContent: { ...DEFAULT_EMPTY_WHITEBOARD_DATA_CLIENT },
          fileSystemRoots: [],
        };
      }
        
      const project: Project = {
        id: dbData.id,
        name: dbData.name,
        ownerId: dbData.ownerId || undefined,
        createdAt: dbData.createdAt,
        updatedAt: dbData.updatedAt,
        textContent: projectCoreData.textContent,
        whiteboardContent: processSingleWhiteboardData(projectCoreData.whiteboardContent, 'load'),
        fileSystemRoots: processFileSystemRootsRecursive(projectCoreData.fileSystemRoots, 'load'),
      };
      projects.push(project);
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
      ownerId: newProjectData.ownerId || null, // Ensure ownerId is null if undefined
      createdAt: now,
      updatedAt: now,
      projectDataBlob: JSON.stringify(sanitizedBlobContent || {}), // Ensure always stringify an object
    };

    const projectDocRef = doc(db, PROJECTS_COLLECTION, newProjectId);
    await setDoc(projectDocRef, projectDocForDb);
    console.log(`[FirestoreService Blob] Project "${projectDocForDb.name}" (ID: ${newProjectId}) created.`);

    const createdProject: Project = {
      id: projectDocForDb.id,
      name: projectDocForDb.name,
      ownerId: projectDocForDb.ownerId || undefined,
      createdAt: projectDocForDb.createdAt,
      updatedAt: projectDocForDb.updatedAt,
      textContent: initialTextContentWithDefaults,
      whiteboardContent: processSingleWhiteboardData(initialWhiteboardContentWithDefaults, 'load'),
      fileSystemRoots: processFileSystemRootsRecursive(initialFileSystemRootsWithDefaults, 'load'),
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

    