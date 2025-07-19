
"use client";

import type { HistoryEntry } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { History, FileClock } from "lucide-react";

interface ProjectHistoryProps {
  history: HistoryEntry[];
}

export function ProjectHistory({ history }: ProjectHistoryProps) {
  const sortedHistory = [...history].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="h-full w-full flex flex-col bg-card text-card-foreground rounded-lg border shadow-sm">
      <ScrollArea className="flex-grow p-2">
        <div className="space-y-4">
          {sortedHistory.length > 0 ? (
            sortedHistory.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <FileClock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-foreground">{entry.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground">
              <History className="h-10 w-10 mb-2" />
              <p className="text-sm">No project history yet.</p>
              <p className="text-xs mt-1">Events like project creation and views will appear here.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
