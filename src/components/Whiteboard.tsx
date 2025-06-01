
"use client";

import React, { useEffect, useState, useRef, useCallback, memo } from "react"; // Added memo
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";
import type { ExcalidrawElement, AppState, BinaryFiles } from "@excalidraw/excalidraw/types/element/types";
import type { WhiteboardData, ExcalidrawAppState as CollabCanvasExcalidrawAppState } from "@/lib/types"; // Use CollabCanvasExcalidrawAppState
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";

interface WhiteboardProps {
  initialData?: WhiteboardData | null;
  onChange?: (data: WhiteboardData) => void;
  isReadOnly?: boolean;
}

const DynamicallyLoadedExcalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => {
    if (!mod.Excalidraw) {
      console.error("Excalidraw named export not found in @excalidraw/excalidraw module. Module keys:", Object.keys(mod));
      return () => <div className="flex h-full w-full items-center justify-center text-destructive-foreground bg-destructive p-4 rounded-lg">Failed to load Excalidraw component. Check console.</div>;
    }
    return mod.Excalidraw;
  }),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-lg border bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Loading Whiteboard...</p>
      </div>
    )
  }
);

const DEFAULT_EMPTY_WHITEBOARD_DATA: WhiteboardData = {
  elements: [],
  appState: { ZenModeEnabled: false, viewModeEnabled: false } as CollabCanvasExcalidrawAppState,
  files: {}
};

// Renamed to allow memoization
const WhiteboardComponent = ({ 
  initialData,
  onChange,
  isReadOnly = false 
}: WhiteboardProps) => {
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [isClient, setIsClient] = useState(false);
  const { theme: appTheme } = useTheme();

  const [sanitizedInitialData, setSanitizedInitialData] = useState<WhiteboardData>(
    DEFAULT_EMPTY_WHITEBOARD_DATA // Initialize with a default structure
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const baseData = initialData || DEFAULT_EMPTY_WHITEBOARD_DATA;
    
    // Ensure appState is always an object, defaulting to Excalidraw's expected minimal structure
    let currentAppState = baseData.appState 
      ? { ...baseData.appState } 
      : { ...DEFAULT_EMPTY_WHITEBOARD_DATA.appState } as CollabCanvasExcalidrawAppState;

    // Ensure collaborators is a Map if the collaborators property exists in appState
    if (currentAppState && currentAppState.hasOwnProperty('collaborators')) {
      const collaboratorsData = currentAppState.collaborators;
      if (collaboratorsData && typeof collaboratorsData === 'object' && !(collaboratorsData instanceof Map)) {
        // Convert plain object from Firestore to a Map
        const newCollaboratorsMap = new Map();
        for (const key in collaboratorsData) {
          if (Object.prototype.hasOwnProperty.call(collaboratorsData, key)) {
            newCollaboratorsMap.set(key, (collaboratorsData as any)[key]);
          }
        }
        currentAppState.collaborators = newCollaboratorsMap;
      } else if (collaboratorsData === null || collaboratorsData === undefined) {
        // If collaborators key exists but is null/undefined, initialize as an empty Map
        currentAppState.collaborators = new Map();
      }
      // If it's already a Map or correctly undefined (not present as a key), do nothing.
    }
    
    setSanitizedInitialData({
      elements: Array.isArray(baseData.elements) ? baseData.elements : [], // Ensure elements is an array
      appState: currentAppState,
      files: typeof baseData.files === 'object' && baseData.files !== null ? baseData.files : {}, // Ensure files is an object
    });
  }, [initialData]);


  useEffect(() => {
    const api = excalidrawAPIRef.current;
    if (api) {
      const currentInternalAppState = api.getAppState();
      if (currentInternalAppState.viewModeEnabled !== isReadOnly) {
        api.updateScene({ appState: { ...currentInternalAppState, viewModeEnabled: isReadOnly } });
      }
    }
  }, [isReadOnly, excalidrawAPIRef.current]); // Added excalidrawAPIRef.current as it's used

  // This useEffect ensures that if the initialData prop changes (e.g., from a remote update),
  // the Excalidraw component updates its scene.
  useEffect(() => {
    const api = excalidrawAPIRef.current;
    if (api && sanitizedInitialData) {
      // Check if the scene data is substantially different to avoid unnecessary updates
      // This is a shallow comparison, deeper comparison might be needed if frequent unnecessary re-renders occur
      const currentApiElements = api.getSceneElements();
      const currentApiAppState = api.getAppState();

      // Only update if elements or appState are meaningfully different
      // This is a basic check; a more robust diffing might be needed for complex scenarios
      if (
        JSON.stringify(currentApiElements) !== JSON.stringify(sanitizedInitialData.elements) ||
        JSON.stringify(currentApiAppState) !== JSON.stringify(sanitizedInitialData.appState)
      ) {
         api.updateScene({
            elements: sanitizedInitialData.elements || [],
            appState: sanitizedInitialData.appState as AppState, // Cast to Excalidraw's AppState
            files: sanitizedInitialData.files || {},
        });
      }
    }
  }, [sanitizedInitialData, excalidrawAPIRef.current]); // Added excalidrawAPIRef.current

  const handleExcalidrawChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      if (onChange && !isReadOnly) { // Only call onChange if not read-only
        onChange({ elements, appState: appState as CollabCanvasExcalidrawAppState, files });
      }
    },
    [onChange, isReadOnly] 
  );

  if (!isClient) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Initializing Whiteboard...</p>
      </div>
    );
  }
  
  return (
    <div className="h-full w-full rounded-lg border bg-card text-card-foreground shadow-sm excalidraw-wrapper">
      <DynamicallyLoadedExcalidraw
        excalidrawAPI={(api) => (excalidrawAPIRef.current = api)}
        initialData={sanitizedInitialData} 
        onChange={handleExcalidrawChange}
        viewModeEnabled={isReadOnly} 
        uiOptions={{ canvasActions: { toggleMenu: false } }} // Hides the Excalidraw main menu
        theme={appTheme === 'dark' ? 'dark' : 'light'}
      />
    </div>
  );
};

export const Whiteboard = memo(WhiteboardComponent);
