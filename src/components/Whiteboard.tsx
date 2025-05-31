
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

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const api = excalidrawAPIRef.current;
    if (api) {
      // Handle isReadOnly changes directly affecting viewModeEnabled
      const currentAppState = api.getAppState();
      if (currentAppState.viewModeEnabled !== isReadOnly) {
        api.updateScene({ appState: { ...currentAppState, viewModeEnabled: isReadOnly } });
      }

      // Handle theme changes
      const currentExcalidrawTheme = currentAppState.theme || 'light';
      const targetExcalidrawTheme = appTheme === 'dark' ? 'dark' : 'light';
      if (currentExcalidrawTheme !== targetExcalidrawTheme) {
        api.setTheme(targetExcalidrawTheme);
      }
    }
  }, [isReadOnly, appTheme]); // Effect only for imperative changes not covered by props

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
    [onChange] // Depends on the stability of onChange prop from parent
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
        initialData={initialData || DEFAULT_EMPTY_WHITEBOARD_DATA} // Excalidraw handles changes to this prop
        onChange={handleExcalidrawChange}
        viewModeEnabled={isReadOnly} // Directly pass isReadOnly
        uiOptions={{ canvasActions: { toggleMenu: false } }}
        theme={appTheme === 'dark' ? 'dark' : 'light'}
      />
    </div>
  );
};

export const Whiteboard = memo(WhiteboardComponent); // Export the memoized component
