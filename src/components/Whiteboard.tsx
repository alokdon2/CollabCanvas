
"use client";

import type { ExcalidrawImperativeAPI, ExcalidrawProps } from "@excalidraw/excalidraw/types/types";
import type { ExcalidrawElement, AppState, BinaryFiles } from "@excalidraw/excalidraw/types/element/types";
import type { WhiteboardData } from "@/lib/types";
import { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider"; // For theme syncing

// Dynamically import Excalidraw component
const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false, loading: () => <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /> <p className="ml-2">Loading Whiteboard...</p></div> }
);

interface WhiteboardProps {
  initialData?: WhiteboardData | null;
  onChange?: (data: WhiteboardData) => void;
  isReadOnly?: boolean;
}

export function Whiteboard({ initialData, onChange, isReadOnly = false }: WhiteboardProps) {
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [isClient, setIsClient] = useState(false);
  const { theme: appTheme } = useTheme(); // Get app's current theme

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
  
  const excalidrawKey = initialData ? JSON.stringify(initialData.elements.map(el => el.id + el.version).join()) : 'empty';


  if (!isClient) {
     return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /> <p className="ml-2">Initializing Whiteboard...</p></div>;
  }

  return (
    <div className="h-full w-full rounded-lg border bg-card text-card-foreground shadow-sm excalidraw-wrapper">
      <Excalidraw
        key={excalidrawKey} // Force re-render if initial elements change significantly
        excalidrawAPI={(api) => (excalidrawAPIRef.current = api)}
        initialData={{
          elements: initialData?.elements || [],
          appState: initialData?.appState || { viewBackgroundColor: appTheme === 'dark' ? '#1a1a1a' : '#ffffff' },
          files: initialData?.files || undefined,
        }}
        onChange={debouncedOnChange}
        viewModeEnabled={isReadOnly}
        theme={appTheme === 'dark' ? 'dark' : 'light'} // Sync Excalidraw theme with app theme
        //ZenModeEnabled // Example prop
        //GridModeEnabled // Example prop
      />
    </div>
  );
}
