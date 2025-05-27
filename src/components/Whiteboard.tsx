"use client";

import type { ExcalidrawImperativeAPI, ExcalidrawProps } from "@excalidraw/excalidraw/types/types";
import type { ExcalidrawElement, AppState } from "@excalidraw/excalidraw/types/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types/types";

import React, { useEffect, useState, useRef } from "react";
import { useTheme } from "@/components/providers/ThemeProvider";
import type { WhiteboardData } from "@/lib/types";

interface WhiteboardComponentProps {
  initialData?: WhiteboardData | null;
  onChange?: (data: WhiteboardData) => void;
  isReadOnly?: boolean;
}

// Dynamically import Excalidraw to ensure it's client-side only
let ExcalidrawComponent: React.ComponentType<ExcalidrawProps> | null = null;
if (typeof window !== "undefined") {
  import("@excalidraw/excalidraw").then((module) => {
    ExcalidrawComponent = module.Excalidraw;
  });
}


export function Whiteboard({ initialData, onChange, isReadOnly = false }: WhiteboardComponentProps) {
  const [Excalidraw, setExcalidraw] = useState<React.ComponentType<ExcalidrawProps> | null>(null);
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const { theme } = useTheme(); // For dark/light mode consistency

  useEffect(() => {
    import("@excalidraw/excalidraw").then((module) => {
      setExcalidraw(() => module.Excalidraw); // Use functional update for setting state based on dynamic import
    });
  }, []);
  
  const UIOptions = {
    canvasActions: {
      changeViewBackgroundColor: !isReadOnly,
      clearCanvas: !isReadOnly,
      export: true,
      loadScene: !isReadOnly,
      saveToActiveFile: !isReadOnly,
      toggleTheme: true, // Let Excalidraw handle its own theme toggle, or sync with app theme
      saveAsImage: true,
    },
  };

  const currentInitialData = initialData || { elements: [], appState: {}, files: {} };

  // Debounce onChange
  const debouncedOnChange = useRef(
    debounce((elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (onChange) {
        onChange({
          elements,
          appState: { 
            ...appState, 
            // Ensure viewBackgroundColor is serializable if it's part of the state to save
            viewBackgroundColor: appState.viewBackgroundColor || '#ffffff' 
          },
          files,
        });
      }
    }, 500)
  ).current;

  if (!Excalidraw) {
    return (
      <div className="flex flex-col h-full items-center justify-center rounded-lg border bg-card text-card-foreground shadow-sm p-4">
        <p className="text-muted-foreground">Loading Whiteboard...</p>
        <p className="text-xs text-muted-foreground mt-2">
          This component uses @excalidraw/excalidraw. If it fails to load, please ensure the package is installed.
        </p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full rounded-lg border bg-card text-card-foreground shadow-sm">
       <div className="p-4 border-b">
        <h3 className="text-lg font-semibold">Whiteboard</h3>
      </div>
      <div style={{ height: "calc(100% - 65px)" }} className="w-full excalidraw-wrapper">
        <Excalidraw
          ref={(api: ExcalidrawImperativeAPI | null) => excalidrawAPIRef.current = api}
          initialData={{
            elements: currentInitialData.elements,
            appState: currentInitialData.appState,
            files: currentInitialData.files,
          }}
          onChange={debouncedOnChange}
          UIOptions={UIOptions}
          viewModeEnabled={isReadOnly}
          theme={theme} // Sync Excalidraw theme with app theme
          detectScroll={false}
          // Ensure gridModeEnabled is part of appState if you want to persist it
          gridModeEnabled={ (currentInitialData.appState as any)?.gridModeEnabled ?? false } 
        />
      </div>
    </div>
  );
}

// Debounce helper function
function debounce<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
}
