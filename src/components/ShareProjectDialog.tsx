
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@/lib/types";

interface ShareProjectDialogProps {
  project: Project;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isLocal?: boolean; // To adjust text based on backend
}

export function ShareProjectDialog({ project, isOpen, onOpenChange, isLocal = false }: ShareProjectDialogProps) {
  const [shareableLink, setShareableLink] = useState("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (project && typeof window !== 'undefined') {
      // The ?shared=true parameter can be used by ProjectPage to enable a read-only view
      setShareableLink(`${window.location.origin}/project/${project.id}?shared=true`);
    }
  }, [project]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      setCopied(true);
      toast({ title: "Link copied!", description: "Shareable link copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ title: "Failed to copy", description: "Could not copy link to clipboard.", variant: "destructive" });
      console.error("Failed to copy text: ", err);
    }
  };

  if (!project) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Share "{project.name}"</DialogTitle>
          <DialogDescription>
            Anyone with this link can view the project.
            {isLocal 
              ? " Note: This project is stored locally in your browser. The link works for you to reopen it, but others won't see your local changes unless you export and share the data."
              : " Editing permissions are not yet implemented for shared links via Firestore."
            }
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex items-center space-x-2">
            <Input
              id="share-link"
              value={shareableLink}
              readOnly
              className="flex-1"
            />
            <Button type="button" size="icon" onClick={handleCopyLink} aria-label="Copy link">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          {!isLocal && (
            <p className="text-xs text-muted-foreground">
              Real-time collaboration and detailed permission settings are features for future development.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
