
"use client";

import React, { useEffect, useState, useRef, useCallback, memo } from "react"; // Added memo
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";
import type { ExcalidrawElement, AppState, BinaryFiles } from "@excalidraw/excalidraw/types/element/types";
import type { WhiteboardData } from "@/lib/types";
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
  appState: { ZenModeEnabled: false, viewModeEnabled: false },
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
    initialData || DEFAULT_EMPTY_WHITEBOARD_DATA
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const baseData = initialData || DEFAULT_EMPTY_WHITEBOARD_DATA;
    let currentAppState = baseData.appState ? { ...baseData.appState } : {};

    if (currentAppState.hasOwnProperty('collaborators')) {
      if (currentAppState.collaborators === null ||
          (typeof currentAppState.collaborators === 'object' && !(currentAppState.collaborators instanceof Map))) {
        currentAppState.collaborators = new Map();
      }
    }
    
    setSanitizedInitialData({
      ...baseData,
      appState: currentAppState,
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
  }, [isReadOnly]);

  // This useEffect ensures that if the initialData prop changes (e.g., from a remote update),
  // the Excalidraw component updates its scene.
  useEffect(() => {
    const api = excalidrawAPIRef.current;
    if (api && sanitizedInitialData) {
      // Prepare the scene data, ensuring appState and files are not undefined if they are empty.
      const sceneToUpdate: {
        elements: readonly ExcalidrawElement[];
        appState?: AppState;
        files?: BinaryFiles;
      } = {
        elements: sanitizedInitialData.elements || [],
      };
      if (sanitizedInitialData.appState) {
        sceneToUpdate.appState = sanitizedInitialData.appState;
      }
      if (sanitizedInitialData.files) {
        sceneToUpdate.files = sanitizedInitialData.files;
      }
      api.updateScene(sceneToUpdate);
    }
  }, [sanitizedInitialData]); // This effect runs when sanitizedInitialData (derived from initialData prop) changes.

  const handleExcalidrawChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      if (onChange) {
        onChange({ elements, appState, files });
      }
    },
    [onChange] 
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
        uiOptions={{ canvasActions: { toggleMenu: false } }}
        theme={appTheme === 'dark' ? 'dark' : 'light'}
      />
    </div>
  );
};

export const Whiteboard = memo(WhiteboardComponent);

