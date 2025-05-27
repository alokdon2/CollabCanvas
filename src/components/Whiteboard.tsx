
"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";
import type { ExcalidrawElement, AppState, BinaryFiles } from "@excalidraw/excalidraw/types/element/types";
import type { WhiteboardData } from "@/lib/types";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
// import { useTheme } from "@/components/providers/ThemeProvider"; // Theme integration temporarily removed

interface WhiteboardProps {
  initialData?: WhiteboardData | null; // This prop will be effectively ignored for now
  onChange?: (data: WhiteboardData) => void; // This prop will not be called for now
  isReadOnly?: boolean;
}

// Dynamically import Excalidraw component
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


export function Whiteboard({ 
  // initialData prop is received but will be overridden below
  // onChange prop is received but will not be called by debouncedOnChange
  isReadOnly = false 
}: WhiteboardProps) {
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [isClient, setIsClient] = useState(false);
  // const { theme: appTheme } = useTheme(); // Theme integration temporarily removed

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Debounce onChange to avoid excessive updates
  const debouncedOnChange = useCallback(
    (
      _elements: readonly ExcalidrawElement[], // Parameter is unused
      _appState: AppState, // Parameter is unused
      _files: BinaryFiles // Parameter is unused
    ) => {
      // Do nothing to prevent saving data, per user request for debugging.
      // This means the onChange prop passed from ProjectPage will not be called.
      // if (onChange) {
      //   onChange({ elements, appState, files });
      // }
    },
    [] // No dependencies needed as the callback does nothing with external state/props
  );

  if (!isClient) {
    // This will show the loading indicator from the dynamic import if it hasn't already finished.
    // It ensures we don't even try to render DynamicallyLoadedExcalidraw until mounted.
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Initializing Whiteboard...</p>
      </div>
    );
  }
  
  // Always use a fresh, minimal, blank JSON object for Excalidraw's initialData
  const freshInitialData: WhiteboardData = {
    elements: [],
    appState: {
      // You can set a default background or other appState properties here if needed
      // viewBackgroundColor: appTheme === 'dark' ? '#202124' : '#FFFFFF', // Example if theme was used
    }, 
    files: {}
  };

  return (
    <div className="h-full w-full rounded-lg border bg-card text-card-foreground shadow-sm excalidraw-wrapper">
      <DynamicallyLoadedExcalidraw
        excalidrawAPI={(api) => (excalidrawAPIRef.current = api)}
        initialData={freshInitialData} // Always pass a fresh, blank object
        onChange={debouncedOnChange} // This will not propagate changes to the parent
        viewModeEnabled={isReadOnly}
        // theme={appTheme === 'dark' ? 'dark' : 'light'} // Theme integration temporarily removed
      />
    </div>
  );
}
