
"use client";

import { useState } from 'react';
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, AlignLeft, Loader2, Pilcrow } from "lucide-react"; // Added Pilcrow for auto-format
import { AITextEnhancementDialog } from "./AITextEnhancementDialog";
import { generateProjectSummary, type GenerateProjectSummaryOutput } from "@/ai/flows/generate-project-summary";
import { autoFormatText, type AutoFormatTextOutput } from "@/ai/flows/autoformat-text-flow"; // Added new flow import
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
  onEnhancedText: (enhancedText: string) => void; // This can be used for auto-formatting as well
}

export function RichTextEditor({ value, onChange, onEnhancedText }: RichTextEditorProps) {
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);
  const [selectedTextForAI, setSelectedTextForAI] = useState("");

  const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);
  const [summaryContent, setSummaryContent] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);

  const [isAutoFormatting, setIsAutoFormatting] = useState(false); // State for auto-formatting loading

  const { toast } = useToast();

  const getSelectedTextOrFullDocument = () => {
    const textareaElement = document.getElementById("rich-text-area") as HTMLTextAreaElement;
    let currentSelection = "";
    if (textareaElement) {
      currentSelection = textareaElement.value.substring(textareaElement.selectionStart, textareaElement.selectionEnd);
    }
    return currentSelection || value; // Use selection or full text
  };

  const handleAIButtonClick = () => {
    setSelectedTextForAI(getSelectedTextOrFullDocument());
    setIsAIDialogOpen(true);
  };

  const handleApplyEnhancedText = (enhancedText: string) => {
    const textToReplace = selectedTextForAI;
    if (textToReplace && textToReplace !== value && value.includes(textToReplace)) {
        onChange(value.replace(textToReplace, enhancedText));
    } else {
        onChange(enhancedText); 
    }
    onEnhancedText(enhancedText);
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

  const handleAutoFormatDocument = async () => {
    const textToFormat = getSelectedTextOrFullDocument();
    if (!textToFormat.trim()) {
      toast({ title: "Cannot Auto-Format", description: "There is no text to format.", variant: "destructive" });
      return;
    }
    setIsAutoFormatting(true);
    setSelectedTextForAI(textToFormat); // Store the text that will be replaced

    try {
      const result: AutoFormatTextOutput = await autoFormatText({ textToFormat });
      if (selectedTextForAI && selectedTextForAI !== value && value.includes(selectedTextForAI)) {
        onChange(value.replace(selectedTextForAI, result.formattedText));
      } else {
         onChange(result.formattedText);
      }
      onEnhancedText(result.formattedText); // Notify parent of change

      toast({
        title: "AI Auto-Format Successful",
        description: result.explanation || "The text has been auto-formatted.",
      });
    } catch (error) {
      console.error("AI auto-formatting error:", error);
      toast({ title: "AI Error", description: "Failed to auto-format text. Please try again.", variant: "destructive" });
    } finally {
      setIsAutoFormatting(false);
    }
  };

  return (
    <div className="flex flex-col h-full rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="p-2 border-b flex justify-between items-center gap-1 flex-wrap">
        <h3 className="text-lg font-semibold px-2">Document</h3>
        <div className="flex items-center gap-1 flex-wrap">
          <Button onClick={handleAIButtonClick} variant="outline" size="sm" disabled={!value.trim() || isAutoFormatting || isSummarizing}>
            <Sparkles className="mr-2 h-4 w-4" /> AI Enhance
          </Button>
          <Button onClick={handleAutoFormatDocument} variant="outline" size="sm" disabled={!value.trim() || isAutoFormatting || isSummarizing}>
            {isAutoFormatting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pilcrow className="mr-2 h-4 w-4" />}
            AI Auto-Format
          </Button>
          <Button onClick={handleSummarizeDocument} variant="outline" size="sm" disabled={!value.trim() || isSummarizing || isAutoFormatting}>
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
