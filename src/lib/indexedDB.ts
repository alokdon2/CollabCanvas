
'use client';

import type { Project } from './types';

const DB_NAME = 'CollabCanvasDB';
const DB_VERSION = 2;
const PROJECT_STORE_NAME = 'projects';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject(new Error('IndexedDB can only be used in the browser.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error('IndexedDB error:', (event.target as IDBRequest).error);
        dbPromise = null; // Reset promise on error
        reject('Error opening IndexedDB: ' + (event.target as IDBRequest).error?.message);
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onupgradeneeded = (event) => {
        const localDb = (event.target as IDBOpenDBRequest).result;
        if (!localDb.objectStoreNames.contains(PROJECT_STORE_NAME)) {
          localDb.createObjectStore(PROJECT_STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }
  return dbPromise;
}

export async function dbGetAllProjects(): Promise<Project[]> {
  const currentDb = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(PROJECT_STORE_NAME, 'readonly');
    const store = transaction.objectStore(PROJECT_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = (event) => {
      console.error('Error fetching all projects:', (event.target as IDBRequest).error);
      reject('Error fetching all projects: ' + (event.target as IDBRequest).error?.message);
    };
  });
}

export async function dbGetProjectById(id: string): Promise<Project | undefined> {
  const currentDb = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(PROJECT_STORE_NAME, 'readonly');
    const store = transaction.objectStore(PROJECT_STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = (event) => {
      console.error('Error fetching project by ID:', (event.target as IDBRequest).error);
      reject('Error fetching project by ID: ' + (event.target as IDBRequest).error?.message);
    };
  });
}

export async function dbSaveProject(project: Project): Promise<void> {
  const currentDb = await getDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = currentDb.transaction(PROJECT_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PROJECT_STORE_NAME);
    const request = store.put(project); // put handles both add and update

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      console.error('Error saving project:', (event.target as IDBRequest).error);
      reject('Error saving project: ' + (event.target as IDBRequest).error?.message);
    };
  });
}

export async function dbDeleteProject(id: string): Promise<void> {
  const currentDb = await getDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = currentDb.transaction(PROJECT_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PROJECT_STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      console.error('Error deleting project:', (event.target as IDBRequest).error);
      reject('Error deleting project: ' + (event.target as IDBRequest).error?.message);
    };
  });
}

export async function dbSaveAllProjects(projects: Project[]): Promise<void> {
  const currentDb = await getDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = currentDb.transaction(PROJECT_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PROJECT_STORE_NAME);
    let operationsCompleted = 0;
    let failed = false;

    const onOperationComplete = () => {
      operationsCompleted++;
      if (operationsCompleted === projects.length + 1 && !failed) { // +1 for clear operation
        resolve();
      }
    };

    const onOperationError = (event: Event, operation: string) => {
      if (failed) return;
      failed = true;
      console.error(`Error during ${operation}:`, (event.target as IDBRequest).error);
      reject(`Error during ${operation}: ` + (event.target as IDBRequest).error?.message);
    };
    
    const clearRequest = store.clear();
    clearRequest.onsuccess = () => {
      if (projects.length === 0) {
        resolve(); // Cleared and no projects to add.
        return;
      }
      onOperationComplete(); // Clear counts as one operation

      projects.forEach(project => {
        if (failed) return;
        const putRequest = store.put(project);
        putRequest.onsuccess = onOperationComplete;
        putRequest.onerror = (event) => onOperationError(event, 'put project');
      });
    };
    clearRequest.onerror = (event) => onOperationError(event, 'clear store');
  });
}
