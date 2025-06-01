
"use client"; // Added "use client" for useMemo

import Link from "next/link";
import { format } from "date-fns";
import { Edit3, FileText, Trash2, Share2, LayoutDashboard, Folder } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Project, FileSystemNode } from "@/lib/types";
import React, { useMemo } from "react"; // Import React and useMemo

interface ProjectCardProps {
  project: Project;
  onDeleteProject: (projectId: string) => void;
  onShareProject: (project: Project) => void;
}

function countFileSystemItems(nodes: FileSystemNode[]): number {
  let count = nodes.length;
  for (const node of nodes) {
    if (node.type === 'folder' && node.children) {
      count += countFileSystemItems(node.children);
    }
  }
  return count;
}

const ProjectCardComponent = ({ project, onDeleteProject, onShareProject }: ProjectCardProps) => {
  const { textSnippet, whiteboardItemCount, fileSystemItemCount } = useMemo(() => {
    const snippet = project.textContent?.replace(/<[^>]+>/g, ' ').trim();
    const boardItems = project.whiteboardContent?.elements?.length || 0;
    const fsItems = project.fileSystemRoots ? countFileSystemItems(project.fileSystemRoots) : 0;
    return {
      textSnippet: snippet,
      whiteboardItemCount: boardItems,
      fileSystemItemCount: fsItems,
    };
  }, [project.textContent, project.whiteboardContent, project.fileSystemRoots]);


  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="truncate text-xl">{project.name}</CardTitle>
        <CardDescription>
          Last updated: {format(new Date(project.updatedAt), "PPP p")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow space-y-2">
        <div className="flex items-start space-x-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="line-clamp-2 break-all">
            {textSnippet ? `${textSnippet.substring(0, 60)}...` : "Empty document"}
          </span>
        </div>
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          <span>
            {whiteboardItemCount > 0 ? `${whiteboardItemCount} board item${whiteboardItemCount === 1 ? '' : 's'}` : "Empty board"}
          </span>
        </div>
         <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <Folder className="h-4 w-4 shrink-0" />
          <span>
            {fileSystemItemCount > 0 ? `${fileSystemItemCount} project file${fileSystemItemCount === 1 ? '' : 's'}` : "No project files"}
          </span>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button asChild variant="default" size="sm">
          <Link href={`/project/${project.id}`}>
            <Edit3 className="mr-2 h-4 w-4" /> Open
          </Link>
        </Button>
        <div className="flex space-x-2">
          <Button variant="outline" size="icon" onClick={() => onShareProject(project)} aria-label="Share project">
            <Share2 className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon" aria-label="Delete project">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the
                  project "{project.name}".
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDeleteProject(project.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardFooter>
    </Card>
  );
}

export const ProjectCard = React.memo(ProjectCardComponent);
