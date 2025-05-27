"use client";

import { useState } from 'react';
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { AITextEnhancementDialog } from "./AITextEnhancementDialog";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onEnhancedText: (enhancedText: string) => void;
}

export function RichTextEditor({ value, onChange, onEnhancedText }: RichTextEditorProps) {
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);
  const [selectedTextForAI, setSelectedTextForAI] = useState("");

  const handleAIButtonClick = () => {
    // For simplicity, we'll use the entire content if no text is selected.
    // A more advanced implementation would get the actual selected text from the textarea.
    const textareaElement = document.getElementById("rich-text-area") as HTMLTextAreaElement;
    if (textareaElement) {
      const selection = textareaElement.value.substring(textareaElement.selectionStart, textareaElement.selectionEnd);
      setSelectedTextForAI(selection || value); // Use selection or full text
    } else {
      setSelectedTextForAI(value);
    }
    setIsAIDialogOpen(true);
  };

  const handleApplyEnhancedText = (enhancedText: string, originalSelectedText: string) => {
    // This is a simplified replacement logic.
    // If originalSelectedText was empty (meaning full text was enhanced), replace all.
    // Otherwise, try to replace the original selection.
    if (originalSelectedText && value.includes(originalSelectedText)) {
        onChange(value.replace(originalSelectedText, enhancedText));
    } else {
        // Fallback to replacing entire content or appending if original not found
        onChange(enhancedText); 
    }
    onEnhancedText(enhancedText); // Notify parent if needed
  };

  return (
    <div className="flex flex-col h-full rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="p-4 border-b flex justify-between items-center">
        <h3 className="text-lg font-semibold">Document</h3>
        <Button onClick={handleAIButtonClick} variant="outline" size="sm" disabled={!value.trim()}>
          <Sparkles className="mr-2 h-4 w-4" /> AI Enhance
        </Button>
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
        onApply={(enhancedText) => handleApplyEnhancedText(enhancedText, selectedTextForAI)}
      />
    </div>
  );
}
