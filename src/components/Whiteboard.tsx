
"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
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
  appState: { ZenModeEnabled: false, viewModeEnabled: false }, // Ensure some defaults
  files: {}
};

export function Whiteboard({ 
  initialData,
  onChange,
  isReadOnly = false 
}: WhiteboardProps) {
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [isClient, setIsClient] = useState(false);
  const { theme: appTheme } = useTheme();

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (excalidrawAPIRef.current) {
      const dataToLoad = initialData || DEFAULT_EMPTY_WHITEBOARD_DATA;
      excalidrawAPIRef.current.updateScene({
        elements: dataToLoad.elements,
        appState: { 
            ...(dataToLoad.appState || {}), 
            // Explicitly ensure viewBackgroundColor is not set here if we want theme prop to control it
            // However, Excalidraw's theme prop might not always override viewBackgroundColor if present in appState
            // For safety, let's ensure viewBackgroundColor is undefined unless explicitly in initialData.appState
            viewBackgroundColor: dataToLoad.appState?.viewBackgroundColor 
        },
        files: dataToLoad.files,
      });
      // If switching to readOnly mode, ensure Excalidraw's internal state reflects it
      if (isReadOnly !== excalidrawAPIRef.current.getAppState().viewModeEnabled) {
          excalidrawAPIRef.current.updateScene({ appState: { viewModeEnabled: isReadOnly } });
      }
    }
  }, [initialData, isReadOnly, appTheme]); // Rerun if initialData, isReadOnly or appTheme changes

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
  
  // For the very first render, Excalidraw needs some initialData.
  // The useEffect above will handle subsequent updates.
  const excalidrawRenderInitialData = initialData || DEFAULT_EMPTY_WHITEBOARD_DATA;

  return (
    <div className="h-full w-full rounded-lg border bg-card text-card-foreground shadow-sm excalidraw-wrapper">
      <DynamicallyLoadedExcalidraw
        excalidrawAPI={(api) => (excalidrawAPIRef.current = api)}
        initialData={excalidrawRenderInitialData}
        onChange={handleExcalidrawChange}
        viewModeEnabled={isReadOnly} 
        uiOptions={{ canvasActions: { toggleMenu: false } }}
        theme={appTheme === 'dark' ? 'dark' : 'light'}
      />
    </div>
  );
}
