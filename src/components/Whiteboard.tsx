
"use client";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";
import type { ExcalidrawElement, AppState, BinaryFiles } from "@excalidraw/excalidraw/types/element/types";
import type { WhiteboardData } from "@/lib/types";
import React, { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
// import { useTheme } from "@/components/providers/ThemeProvider"; // Temporarily remove

// Dynamically import Excalidraw component
const DynamicallyLoadedExcalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => {
    if (!mod.Excalidraw) {
      console.error("Excalidraw named export not found in @excalidraw/excalidraw module. Module keys:", Object.keys(mod));
      // Return a dummy component or throw a more specific error
      return () => <div className="flex h-full w-full items-center justify-center text-destructive-foreground bg-destructive p-4 rounded-lg">Failed to load Excalidraw component. Check console.</div>;
    }
    return mod.Excalidraw;
  }),
  { 
    ssr: false, 
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" /> 
        <p className="ml-2 text-muted-foreground">Loading Whiteboard...</p>
      </div>
    ) 
  }
);


interface WhiteboardProps {
  initialData?: WhiteboardData | null;
  onChange?: (data: WhiteboardData) => void;
  isReadOnly?: boolean;
}

export function Whiteboard({ initialData, onChange, isReadOnly = false }: WhiteboardProps) {
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [isClient, setIsClient] = useState(false);
  // const { theme: appTheme } = useTheme(); // Temporarily remove

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Debounce onChange to avoid excessive updates
  const debouncedOnChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (onChange) {
        // Filter out unnecessary appState properties if needed to reduce storage size
        const minimalAppState: Partial<AppState> = {
          viewBackgroundColor: appState.viewBackgroundColor,
          currentItemStrokeColor: appState.currentItemStrokeColor,
          currentItemBackgroundColor: appState.currentItemBackgroundColor,
          currentItemFillStyle: appState.currentItemFillStyle,
          currentItemStrokeWidth: appState.currentItemStrokeWidth,
          currentItemRoughness: appState.currentItemRoughness,
          currentItemOpacity: appState.currentItemOpacity,
          currentItemFontFamily: appState.currentItemFontFamily,
          currentItemFontSize: appState.currentItemFontSize,
          currentItemTextAlign: appState.currentItemTextAlign,
          zoom: appState.zoom,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
        };
        onChange({ elements, appState: minimalAppState, files });
      }
    },
    [onChange]
  );
  
  const currentInitialData = React.useMemo(() => {
    return {
      elements: initialData?.elements || [],
      // Temporarily use a static background color, remove appTheme dependency
      appState: initialData?.appState || { viewBackgroundColor: '#FFFFFF' }, 
      files: initialData?.files || undefined,
    };
  // }, [initialData, appTheme]); // Temporarily remove appTheme
  }, [initialData]);


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
        // key={excalidrawKey} // Removed key to prevent unnecessary re-mounts
        excalidrawAPI={(api) => (excalidrawAPIRef.current = api)}
        initialData={currentInitialData}
        onChange={debouncedOnChange}
        viewModeEnabled={isReadOnly}
        // theme={appTheme === 'dark' ? 'dark' : 'light'} // Temporarily remove
      />
    </div>
  );
}
