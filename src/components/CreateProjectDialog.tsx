
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle } from "lucide-react";
import type { Project } from "@/lib/types";

interface CreateProjectDialogProps {
  // Pass only the data needed to create a project, ID and timestamps will be generated
  onCreateProject: (newProjectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'fileSystemRoots'> & { textContent?: string, whiteboardContent?: WhiteboardData | null }) => void;
}

export function CreateProjectDialog({ onCreateProject }: CreateProjectDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    if (!projectName.trim()) {
      setError("Project name cannot be empty.");
      return;
    }
    setError("");
    // We pass a partial project object, the full object with ID and timestamps is created in DashboardPage
    const newProjectData = {
      name: projectName.trim(),
      textContent: "<p></p>", 
      whiteboardContent: null,
    };
    onCreateProject(newProjectData);
    setProjectName("");
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" /> Create Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Give your new project a name. You can change this later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="col-span-3"
              aria-describedby="name-error"
            />
          </div>
          {error && <p id="name-error" className="col-span-4 text-sm text-red-500 text-center">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button type="submit" onClick={handleSubmit}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
