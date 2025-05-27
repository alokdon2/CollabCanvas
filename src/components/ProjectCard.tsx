import Link from "next/link";
import { format } from "date-fns";
import { Edit3, FileText, LayoutDashboard, Trash2, Share2 } from "lucide-react";
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
import type { Project } from "@/lib/types";

interface ProjectCardProps {
  project: Project;
  onDeleteProject: (projectId: string) => void;
  onShareProject: (project: Project) => void;
}

export function ProjectCard({ project, onDeleteProject, onShareProject }: ProjectCardProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="truncate text-xl">{project.name}</CardTitle>
        <CardDescription>
          Last updated: {format(new Date(project.updatedAt), "PPP p")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
          <FileText className="h-4 w-4" /> 
          <span>{project.textContent ? `${project.textContent.substring(0,30)}...` : "Empty document"}</span>
        </div>
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <LayoutDashboard className="h-4 w-4" />
          <span>{project.whiteboardContent && project.whiteboardContent.elements.length > 0 ? `${project.whiteboardContent.elements.length} whiteboard items` : "Empty whiteboard"}</span>
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
