
"use client";

import React, { useEffect, useState, useRef, useCallback, memo } from "react"; 
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";
import type { ExcalidrawElement, AppState, BinaryFiles } from "@excalidraw/excalidraw/types/element/types";
import type { WhiteboardData, ExcalidrawAppState as CollabCanvasExcalidrawAppState } from "@/lib/types";
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

const WhiteboardComponent = ({ 
  initialData,
  onChange,
  isReadOnly = false 
}: WhiteboardProps) => {
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [isClient, setIsClient] = useState(false);
  const { theme: appTheme } = useTheme();

  // State to hold the processed initialData, ready for Excalidraw
  const [processedInitialData, setProcessedInitialData] = useState<WhiteboardData>(
    DEFAULT_EMPTY_WHITEBOARD_DATA
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Effect to process the initialData prop when it changes
  useEffect(() => {
    const baseData = initialData || DEFAULT_EMPTY_WHITEBOARD_DATA;
    
    let currentAppState = baseData.appState 
      ? { ...baseData.appState } 
      : { ...DEFAULT_EMPTY_WHITEBOARD_DATA.appState } as CollabCanvasExcalidrawAppState;

    // This ensures collaborators is a Map if it comes as an object (e.g., from Firestore via props)
    if (currentAppState && currentAppState.hasOwnProperty('collaborators')) {
      const collaboratorsData = currentAppState.collaborators;
      if (collaboratorsData && typeof collaboratorsData === 'object' && !(collaboratorsData instanceof Map)) {
        const newCollaboratorsMap = new Map();
        for (const key in collaboratorsData) {
          if (Object.prototype.hasOwnProperty.call(collaboratorsData, key)) {
            newCollaboratorsMap.set(key, (collaboratorsData as any)[key]);
          }
        }
        currentAppState.collaborators = newCollaboratorsMap;
      } else if (collaboratorsData === null || collaboratorsData === undefined) {
        currentAppState.collaborators = new Map();
      }
    }
    
    setProcessedInitialData({
      elements: Array.isArray(baseData.elements) ? baseData.elements : [],
      appState: currentAppState,
      files: typeof baseData.files === 'object' && baseData.files !== null ? baseData.files : {},
    });
  }, [initialData]);


  // Effect to update Excalidraw's viewModeEnabled when isReadOnly prop changes
  useEffect(() => {
    const api = excalidrawAPIRef.current;
    if (api) {
      const currentInternalAppState = api.getAppState();
      if (currentInternalAppState.viewModeEnabled !== isReadOnly) {
        api.updateScene({ appState: { ...currentInternalAppState, viewModeEnabled: isReadOnly } });
      }
    }
  }, [isReadOnly, excalidrawAPIRef]); // Added excalidrawAPIRef

  // Effect to update the Excalidraw scene when processedInitialData changes
  useEffect(() => {
    const api = excalidrawAPIRef.current;
    if (api && processedInitialData) {
      const currentApiElements = api.getSceneElements();
      const currentApiAppState = api.getAppState();

      // Basic diffing to avoid unnecessary updates.
      // A more robust diffing might be needed for complex scenarios if performance issues arise.
      if (
        JSON.stringify(currentApiElements) !== JSON.stringify(processedInitialData.elements) ||
        JSON.stringify(currentApiAppState) !== JSON.stringify(processedInitialData.appState)
      ) {
         api.updateScene({
            elements: processedInitialData.elements || [],
            appState: processedInitialData.appState as AppState,
            files: processedInitialData.files || {},
        });
      }
    }
  }, [processedInitialData, excalidrawAPIRef]); // Added excalidrawAPIRef

  const handleExcalidrawChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      if (onChange && !isReadOnly) { 
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
        initialData={processedInitialData} 
        onChange={handleExcalidrawChange}
        viewModeEnabled={isReadOnly} 
        uiOptions={{ canvasActions: { toggleMenu: false } }} 
        theme={appTheme === 'dark' ? 'dark' : 'light'}
      />
    </div>
  );
};

export const Whiteboard = memo(WhiteboardComponent);
