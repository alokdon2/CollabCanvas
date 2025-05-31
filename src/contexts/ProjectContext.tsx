
'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useCallback } from 'react';

interface ProjectContextType {
  currentProjectName: string | null;
  setCurrentProjectName: (name: string | null) => void;
  // Functions to register the triggers from ProjectPage
  registerTriggerNewFile: (fn: () => void) => void;
  registerTriggerNewFolder: (fn: () => void) => void;
  // Functions for Navbar to call the registered triggers
  requestNewFile: () => void;
  requestNewFolder: () => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const [currentProjectName, setCurrentProjectName] = useState<string | null>(null);
  const [newFileTrigger, setNewFileTrigger] = useState<() => void>(() => () => console.warn('New File trigger not registered'));
  const [newFolderTrigger, setNewFolderTrigger] = useState<() => void>(() => () => console.warn('New Folder trigger not registered'));

  const registerTriggerNewFile = useCallback((fn: () => void) => {
    setNewFileTrigger(() => fn);
  }, []);

  const registerTriggerNewFolder = useCallback((fn: () => void) => {
    setNewFolderTrigger(() => fn);
  }, []);
  
  const requestNewFile = useCallback(() => {
    newFileTrigger();
  }, [newFileTrigger]);

  const requestNewFolder = useCallback(() => {
    newFolderTrigger();
  }, [newFolderTrigger]);

  return (
    <ProjectContext.Provider
      value={{
        currentProjectName,
        setCurrentProjectName,
        registerTriggerNewFile,
        registerTriggerNewFolder,
        requestNewFile,
        requestNewFolder,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjectContext = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
};
