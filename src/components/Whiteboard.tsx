
"use client";

import type { ExcalidrawImperativeAPI, ExcalidrawProps } from "@excalidraw/excalidraw/types/types";
import type { ExcalidrawElement, AppState } from "@excalidraw/excalidraw/types/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types/types";

import React, { useRef } from "react";
import dynamic from 'next/dynamic';
import { useTheme } from "@/components/providers/ThemeProvider";
import type { WhiteboardData } from "@/lib/types";

interface WhiteboardComponentProps {
  initialData?: WhiteboardData | null;
  onChange?: (data: WhiteboardData) => void;
  isReadOnly?: boolean;
}

const DynamicExcalidraw = dynamic<ExcalidrawProps>(
  () => import('@excalidraw/excalidraw').then(mod => mod.Excalidraw as React.ComponentType<ExcalidrawProps>),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col h-full items-center justify-center rounded-lg border bg-card text-card-foreground shadow-sm p-4">
        <p className="text-muted-foreground">Loading Whiteboard...</p>
        <p className="text-xs text-muted-foreground mt-2">
          The Excalidraw component is loading. Please ensure @excalidraw/excalidraw is installed and check console for errors.
        </p>
      </div>
    ),
  }
);

export function Whiteboard({ initialData, onChange, isReadOnly = false }: WhiteboardComponentProps) {
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const { theme } = useTheme(); // For dark/light mode consistency

  const UIOptions = {
    canvasActions: {
      changeViewBackgroundColor: !isReadOnly,
      clearCanvas: !isReadOnly,
      export: true,
      loadScene: !isReadOnly,
      saveToActiveFile: !isReadOnly,
      toggleTheme: true,
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
            viewBackgroundColor: appState.viewBackgroundColor || '#ffffff'
          },
          files,
        });
      }
    }, 500)
  ).current;
  
  return (
    <div className="flex flex-col h-full rounded-lg border bg-card text-card-foreground shadow-sm">
       <div className="p-4 border-b">
        <h3 className="text-lg font-semibold">Whiteboard</h3>
      </div>
      <div style={{ height: "calc(100% - 65px)" }} className="w-full excalidraw-wrapper">
        <DynamicExcalidraw
          ref={excalidrawAPIRef}
          initialData={{
            elements: currentInitialData.elements,
            appState: currentInitialData.appState,
            files: currentInitialData.files,
          }}
          onChange={debouncedOnChange}
          UIOptions={UIOptions}
          viewModeEnabled={isReadOnly}
          theme={theme}
          detectScroll={false}
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

