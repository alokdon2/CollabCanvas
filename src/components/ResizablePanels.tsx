"use client";

import React, { useState, useRef, useCallback, ReactNode, MouseEvent as ReactMouseEvent } from 'react';
import { cn } from '@/lib/utils';
import { GripVertical } from 'lucide-react';

interface ResizablePanelsProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  initialLeftWidth?: number; // Percentage
  minWidth?: number; // Percentage
  className?: string;
}

export function ResizablePanels({
  leftPanel,
  rightPanel,
  initialLeftWidth = 50,
  minWidth = 20, // Minimum 20% width for each panel
  className,
}: ResizablePanelsProps) {
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
  const isResizing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize'; 
    document.body.style.userSelect = 'none';
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isResizing.current) {
      isResizing.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    }
  }, []);

  const handleMouseMove = useCallback((e: globalThis.MouseEvent) => {
    if (!isResizing.current || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

    if (newLeftWidth >= minWidth && newLeftWidth <= (100 - minWidth)) {
      setLeftWidth(newLeftWidth);
    } else if (newLeftWidth < minWidth) {
      setLeftWidth(minWidth);
    } else {
      setLeftWidth(100 - minWidth);
    }
  }, [minWidth]);

  React.useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <div ref={containerRef} className={cn("flex h-full w-full overflow-hidden", className)}>
      <div
        className="h-full overflow-auto"
        style={{ width: `${leftWidth}%` }}
      >
        {leftPanel}
      </div>
      <div
        className="group flex h-full w-3 cursor-col-resize items-center justify-center bg-border/50 hover:bg-border transition-colors"
        onMouseDown={handleMouseDown}
        role="separator"
        aria-label="Resize panels"
        tabIndex={0}
      >
        <GripVertical className="h-5 w-5 text-muted-foreground group-hover:text-foreground" />
      </div>
      <div
        className="h-full overflow-auto"
        style={{ width: `${100 - leftWidth}%` }}
      >
        {rightPanel}
      </div>
    </div>
  );
}
