
"use client";

import { useState } from 'react';
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, AlignLeft, Loader2 } from "lucide-react";
import { AITextEnhancementDialog } from "./AITextEnhancementDialog";
import { generateProjectSummary, type GenerateProjectSummaryOutput } from "@/ai/flows/generate-project-summary";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onEnhancedText: (enhancedText: string) => void;
}

export function RichTextEditor({ value, onChange, onEnhancedText }: RichTextEditorProps) {
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);
  const [selectedTextForAI, setSelectedTextForAI] = useState("");

  const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);
  const [summaryContent, setSummaryContent] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const { toast } = useToast();

  const handleAIButtonClick = () => {
    const textareaElement = document.getElementById("rich-text-area") as HTMLTextAreaElement;
    let currentSelection = "";
    if (textareaElement) {
      currentSelection = textareaElement.value.substring(textareaElement.selectionStart, textareaElement.selectionEnd);
    }
    setSelectedTextForAI(currentSelection || value); // Use selection or full text
    setIsAIDialogOpen(true);
  };

  const handleApplyEnhancedText = (enhancedText: string) => {
    // If selectedTextForAI was specifically chosen (not the full document fallback)
    // and it exists in the current value, replace it.
    // Otherwise, replace the whole content. This logic is a bit simplified.
    if (selectedTextForAI && selectedTextForAI !== value && value.includes(selectedTextForAI)) {
        onChange(value.replace(selectedTextForAI, enhancedText));
    } else {
        // Fallback to replacing entire content
        onChange(enhancedText); 
    }
    onEnhancedText(enhancedText); // Notify parent
  };

  const handleSummarizeDocument = async () => {
    if (!value.trim()) {
      toast({ title: "Cannot Summarize", description: "Document is empty.", variant: "destructive" });
      return;
    }
    setIsSummarizing(true);
    setSummaryContent("");
    try {
      const result: GenerateProjectSummaryOutput = await generateProjectSummary({ textDocumentContent: value });
      setSummaryContent(result.summary);
      setIsSummaryDialogOpen(true);
    } catch (error) {
      console.error("AI summarization error:", error);
      toast({ title: "AI Error", description: "Failed to generate summary. Please try again.", variant: "destructive" });
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="flex flex-col h-full rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="p-2 border-b flex justify-between items-center gap-2">
        <h3 className="text-lg font-semibold px-2">Document</h3>
        <div className="flex items-center gap-2">
          <Button onClick={handleAIButtonClick} variant="outline" size="sm" disabled={!value.trim()}>
            <Sparkles className="mr-2 h-4 w-4" /> AI Enhance
          </Button>
          <Button onClick={handleSummarizeDocument} variant="outline" size="sm" disabled={!value.trim() || isSummarizing}>
            {isSummarizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlignLeft className="mr-2 h-4 w-4" />}
            Summarize
          </Button>
        </div>
      </div>
      <Textarea
        id="rich-text-area"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Start writing your document..."
        className="flex-grow w-full rounded-none border-0 focus-visible:ring-0 resize-none p-4 text-base"
        aria-label="Rich Text Editor"
      />
      <AITextEnhancementDialog
        isOpen={isAIDialogOpen}
        onOpenChange={setIsAIDialogOpen}
        initialText={selectedTextForAI}
        onApply={handleApplyEnhancedText}
      />

      <Dialog open={isSummaryDialogOpen} onOpenChange={setIsSummaryDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Document Summary</DialogTitle>
            <DialogDescription>
              AI-generated summary of your document:
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[300px] w-full rounded-md border p-4 my-4">
            <pre className="text-sm whitespace-pre-wrap break-words">{summaryContent}</pre>
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setIsSummaryDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
