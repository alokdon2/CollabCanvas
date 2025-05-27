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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Wand2 } from "lucide-react";
import { suggestTextImprovements, type SuggestTextImprovementsOutput } from "@/ai/flows/suggest-text-improvements";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AITextEnhancementDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  initialText: string;
  onApply: (enhancedText: string) => void;
}

export function AITextEnhancementDialog({ isOpen, onOpenChange, initialText, onApply }: AITextEnhancementDialogProps) {
  const [textToImprove, setTextToImprove] = useState(initialText);
  const [userPrompt, setUserPrompt] = useState("");
  const [suggestion, setSuggestion] = useState<SuggestTextImprovementsOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setTextToImprove(initialText);
      setSuggestion(null); // Reset suggestion when dialog opens with new text
      setUserPrompt(""); // Reset user prompt
    }
  }, [isOpen, initialText]);

  const handleGetSuggestion = async () => {
    if (!textToImprove.trim()) {
      toast({ title: "Error", description: "Text to improve cannot be empty.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setSuggestion(null);
    try {
      const result = await suggestTextImprovements({ selectedText: textToImprove, userPrompt });
      setSuggestion(result);
    } catch (error) {
      console.error("AI suggestion error:", error);
      toast({ title: "AI Error", description: "Failed to get suggestions. Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplySuggestion = () => {
    if (suggestion?.improvedText) {
      onApply(suggestion.improvedText);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI Text Enhancement</DialogTitle>
          <DialogDescription>
            Improve your text using AI. Edit the text below or provide specific instructions.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div>
            <Label htmlFor="text-to-improve">Text to Improve</Label>
            <Textarea
              id="text-to-improve"
              value={textToImprove}
              onChange={(e) => setTextToImprove(e.target.value)}
              rows={5}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="user-prompt">Specific Instructions (Optional)</Label>
            <Textarea
              id="user-prompt"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="e.g., Make it more formal, shorten it, explain like I'm five..."
              rows={2}
              className="mt-1"
            />
          </div>
          <Button onClick={handleGetSuggestion} disabled={isLoading || !textToImprove.trim()}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            Get Suggestions
          </Button>

          {suggestion && (
            <div className="mt-4 space-y-4">
              <Alert>
                <Wand2 className="h-4 w-4" />
                <AlertTitle>Suggested Improvement</AlertTitle>
                <AlertDescription>
                  <Textarea
                    value={suggestion.improvedText}
                    readOnly
                    rows={5}
                    className="mt-2 bg-muted/50"
                  />
                </AlertDescription>
              </Alert>
              {suggestion.explanation && (
                 <Alert variant="default">
                    <AlertTitle>Explanation</AlertTitle>
                    <AlertDescription className="text-sm">
                        {suggestion.explanation}
                    </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleApplySuggestion} disabled={!suggestion?.improvedText || isLoading}>
            Apply Suggestion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
