
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProjectViewer } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

interface ProjectViewersProps {
  viewers: Record<string, ProjectViewer>;
  maxDisplayed?: number;
}

export function ProjectViewers({ viewers, maxDisplayed = 3 }: ProjectViewersProps) {
  const viewerList = Object.entries(viewers)
    .map(([uid, data]) => ({ uid, ...data }))
    .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime());

  if (viewerList.length === 0) {
    return null;
  }

  const displayedViewers = viewerList.slice(0, maxDisplayed);
  const remainingCount = viewerList.length - displayedViewers.length;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex items-center -space-x-2">
        {displayedViewers.map((viewer, index) => {
          const userName = viewer.displayName || "Anonymous";
          const fallback = userName.charAt(0).toUpperCase();
          const viewedAtString = `Viewed ${formatDistanceToNow(new Date(viewer.viewedAt), { addSuffix: true })}`;
          
          return (
            <Tooltip key={viewer.uid}>
              <TooltipTrigger asChild>
                <Avatar className="h-7 w-7 border-2 border-background" style={{ zIndex: maxDisplayed - index }}>
                  <AvatarImage src={viewer.photoURL || `https://placehold.co/28x28.png`} alt={userName} />
                  <AvatarFallback>{fallback}</AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="font-semibold">{userName}</p>
                <p className="text-xs text-muted-foreground">{viewedAtString}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
        {remainingCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground border-2 border-background" style={{ zIndex: 0 }}>
                    <span className="text-xs font-medium">+{remainingCount}</span>
                </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
                <p>And {remainingCount} more viewer{remainingCount > 1 ? 's' : ''}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
