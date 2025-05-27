
"use client"

import * as React from "react"
// import * as ResizablePrimitive from "@radix-ui/react-resizable-panels" // Commented out: package likely not installed
import { cn } from "@/lib/utils"

// Placeholder components to prevent crashing if @radix-ui/react-resizable-panels is not installed.
// Actual resizing functionality will be lost.

const ResizablePanelGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { direction?: "horizontal" | "vertical" }
>(({ className, children, direction = "horizontal", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
      direction === "vertical" ? "flex-col" : "flex-row",
      className
    )}
    {...props}
    data-panel-group-direction={direction} // Mock attribute for potential downstream CSS
  >
    {children}
  </div>
))
ResizablePanelGroup.displayName = "ResizablePanelGroup"

const ResizablePanel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { defaultSize?: number, minSize?: number, maxSize?: number, id?: string, order?: string, collapsible?: boolean, onCollapse?: () => void, onExpand?: () => void, collapsedSize?: number}
>(({ className, children, style, defaultSize, ...props }, ref) => {
  // Attempt to respect defaultSize for basic layout, but true resizing won't work.
  const flexStyle: React.CSSProperties = { ...style };
  if (typeof defaultSize === 'number') {
    flexStyle.flexGrow = defaultSize / 100;
    flexStyle.flexShrink = 0;
    flexStyle.flexBasis = `${defaultSize}%`;
  } else {
    flexStyle.flex = '1 1 0%';
  }

  return (
    <div ref={ref} className={cn("", className)} style={flexStyle} {...props}>
      {children}
    </div>
  )
})
ResizablePanel.displayName = "ResizablePanel"

const ResizableHandle = React.forwardRef<
  HTMLButtonElement, // Changed to button for basic attributes
  React.ButtonHTMLAttributes<HTMLButtonElement> & { withHandle?: boolean, disabled?: boolean, "data-panel-group-direction"?: "horizontal" | "vertical" }
>(({ className, withHandle, ...props }, ref) => (
  <button
    ref={ref}
    disabled
    className={cn(
      "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90",
      "hidden", // Hide the handle as it won't function
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="lucide lucide-grip-vertical h-2.5 w-2.5"
        >
          <circle cx="9" cy="12" r="1" />
          <circle cx="9" cy="5" r="1" />
          <circle cx="9" cy="19" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="15" cy="5" r="1" />
          <circle cx="15" cy="19" r="1" />
        </svg>
      </div>
    )}
  </button>
))
ResizableHandle.displayName = "ResizableHandle"

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
