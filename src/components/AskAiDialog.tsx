
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Brain, Sparkles } from "lucide-react";
import { askAi, type AskAiOutput } from "@/ai/flows/ask-ai-flow";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "./ui/scroll-area";

interface AskAiDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onInsertResponse: (responseText: string) => void;
  initialQuery?: string;
}

export function AskAiDialog({ isOpen, onOpenChange, onInsertResponse, initialQuery = "" }: AskAiDialogProps) {
  const [userQuery, setUserQuery] = useState(initialQuery);
  const [aiResult, setAiResult] = useState<AskAiOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setUserQuery(initialQuery);
      setAiResult(null); 
    }
  }, [isOpen, initialQuery]);

  const handleGetAnswer = async () => {
    if (!userQuery.trim()) {
      toast({ title: "Error", description: "Query cannot be empty.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setAiResult(null);
    try {
      const result = await askAi({ userQuery });
      setAiResult(result);
    } catch (error) {
      console.error("Ask AI error:", error);
      toast({ title: "AI Error", description: "Failed to get a response. Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInsert = () => {
    if (aiResult?.aiResponse) {
      onInsertResponse(aiResult.aiResponse);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Brain className="mr-2 h-5 w-5" /> Ask AI
          </DialogTitle>
          <DialogDescription>
            Enter your question or prompt below, and the AI will generate a response.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div>
            <Label htmlFor="user-query">Your Question / Prompt</Label>
            <Input
              id="user-query"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="e.g., Write a short story about a friendly robot."
              className="mt-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleGetAnswer();
                }
              }}
            />
          </div>
          <Button onClick={handleGetAnswer} disabled={isLoading || !userQuery.trim()}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Get AI Response
          </Button>

          {aiResult && (
            <div className="mt-4 space-y-4">
              <Alert>
                <Sparkles className="h-4 w-4" />
                <AlertTitle>AI Response</AlertTitle>
                <AlertDescription
                  className="mt-2 max-h-[250px] w-full overflow-y-auto rounded-md border bg-muted/50 p-2"
                >
                  <pre className="whitespace-pre-wrap text-sm font-sans">{aiResult.aiResponse}</pre>
                </AlertDescription>
              </Alert>
              {aiResult.explanation && (
                 <Alert variant="default">
                    <AlertTitle>Explanation</AlertTitle>
                    <AlertDescription className="text-sm">
                        {aiResult.explanation}
                    </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleInsert} disabled={!aiResult?.aiResponse || isLoading}>
            Insert into Editor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
