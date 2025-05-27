
"use client";

import { useEffect, useState } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Sparkles, // For AI Enhance
  Pilcrow,  // For AI Auto-Format
  AlignLeft, // For Summarize
  Loader2,
} from "lucide-react";
import { AITextEnhancementDialog } from "./AITextEnhancementDialog";
import { generateProjectSummary, type GenerateProjectSummaryOutput } from "@/ai/flows/generate-project-summary";
import { autoFormatText, type AutoFormatTextOutput } from "@/ai/flows/autoformat-text-flow";
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
import { Textarea } from './ui/textarea'; // For summary display

interface RichTextEditorProps {
  value: string; // Expects HTML string
  onChange: (value: string) => void; // Will emit HTML string
}

const TipTapToolbar = ({ 
  editor,
  onAiEnhance,
  onAutoFormat,
  onSummarize,
  isAiLoading,
}: { 
  editor: Editor | null;
  onAiEnhance: () => void;
  onAutoFormat: () => void;
  onSummarize: () => void;
  isAiLoading: boolean;
}) => {
  if (!editor) {
    return null;
  }

  return (
    <div className="p-2 border-b flex items-center gap-1 flex-wrap">
      <Button
        onClick={() => editor.chain().focus().toggleBold().run()}
        variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
        size="icon"
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
        size="icon"
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        variant={editor.isActive('heading', { level: 1 }) ? 'secondary' : 'ghost'}
        size="icon"
        title="Heading 1"
      >
        <Heading1 className="h-4 w-4" />
      </Button>
      <Button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        variant={editor.isActive('heading', { level: 2 }) ? 'secondary' : 'ghost'}
        size="icon"
        title="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </Button>
       <Button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        variant={editor.isActive('heading', { level: 3 }) ? 'secondary' : 'ghost'}
        size="icon"
        title="Heading 3"
      >
        <Heading3 className="h-4 w-4" />
      </Button>
      <Button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'}
        size="icon"
        title="Bullet List"
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'}
        size="icon"
        title="Ordered List"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>

      {/* AI Buttons */}
      <div className="h-6 w-px bg-border mx-1"></div>

      <Button
        onClick={onAiEnhance}
        variant="ghost"
        size="icon"
        title="AI Enhance Text"
        disabled={isAiLoading}
      >
        {isAiLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {!isAiLoading && <Sparkles className="h-4 w-4" />}
      </Button>
      <Button
        onClick={onAutoFormat}
        variant="ghost"
        size="icon"
        title="AI Auto-Format"
        disabled={isAiLoading}
      >
        {isAiLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {!isAiLoading && <Pilcrow className="h-4 w-4" />}
      </Button>
      <Button
        onClick={onSummarize}
        variant="ghost"
        size="icon"
        title="Summarize Document"
        disabled={isAiLoading}
      >
        {isAiLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {!isAiLoading && <AlignLeft className="h-4 w-4" />}
      </Button>
    </div>
  );
};

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const { toast } = useToast();
  const [isAiLoading, setIsAiLoading] = useState(false);

  // State for AI Enhance Dialog
  const [isEnhanceDialogOpen, setIsEnhanceDialogOpen] = useState(false);
  const [textForEnhancement, setTextForEnhancement] = useState("");
  const [originalSelectionRange, setOriginalSelectionRange] = useState<{from: number, to: number} | null>(null);


  // State for Summary Dialog
  const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);
  const [summaryContent, setSummaryContent] = useState("");
  
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Configure starter kit options if needed
      }),
    ],
    content: value, // Initial content (HTML string)
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert max-w-none p-4 focus:outline-none h-full', 
      },
    },
  });

  useEffect(() => {
    if (editor) {
      const isSame = editor.getHTML() === value;
      if (isSame) {
        return;
      }
      const { from, to } = editor.state.selection;
      editor.commands.setContent(value, false); // false to prevent firing onUpdate again
      // Try to restore selection if editor had focus, otherwise it might steal focus
      if (editor.isFocused) {
        editor.commands.setTextSelection({ from, to });
      }
    }
  }, [value, editor]);

  const getTextForAI = (): { text: string; selection: {from: number, to: number} | null } => {
    if (!editor) return { text: "", selection: null };
    const { selection } = editor.state;
    if (!selection.empty) {
      return { 
        text: editor.state.doc.textBetween(selection.from, selection.to, ' '),
        selection: { from: selection.from, to: selection.to }
      };
    }
    return { text: editor.getText(), selection: null };
  };

  const handleAiEnhance = () => {
    if (!editor) return;
    const { text, selection } = getTextForAI();
    if (!text.trim()) {
      toast({ title: "Nothing to enhance", description: "Please select text or type something.", variant: "destructive" });
      return;
    }
    setTextForEnhancement(text);
    setOriginalSelectionRange(selection);
    setIsEnhanceDialogOpen(true);
  };

  const onApplyEnhancement = (improvedText: string) => {
    if (!editor) return;
    if (originalSelectionRange) {
      editor.chain().focus().setTextSelection(originalSelectionRange).deleteSelection().insertContent(improvedText).run();
    } else {
      editor.commands.setContent(improvedText);
    }
    setIsEnhanceDialogOpen(false);
    toast({ title: "Text Enhanced", description: "AI suggestion applied."});
  };
  
  const handleAutoFormat = async () => {
    if (!editor) return;
    const { text, selection } = getTextForAI();
     if (!text.trim()) {
      toast({ title: "Nothing to format", description: "Please select text or ensure the document has content.", variant: "destructive" });
      return;
    }
    setIsAiLoading(true);
    try {
      const result: AutoFormatTextOutput = await autoFormatText({ textToFormat: text });
      if (selection) {
        // Replace selection. TipTap should parse basic Markdown.
        editor.chain().focus().setTextSelection(selection).deleteSelection().insertContent(result.formattedText).run();
      } else {
        // Replace whole document
        editor.commands.setContent(result.formattedText);
      }
      toast({ title: "AI Auto-Format Complete", description: result.explanation || "Formatting applied." });
    } catch (error) {
      console.error("AI auto-format error:", error);
      toast({ title: "AI Error", description: "Failed to auto-format text. Please try again.", variant: "destructive" });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSummarize = async () => {
    if (!editor || !editor.getText().trim()) {
       toast({ title: "Document is empty", description: "Cannot summarize an empty document.", variant: "destructive" });
      return;
    }
    setIsAiLoading(true);
    try {
      const docText = editor.getText(); // Get plain text for summary
      const result: GenerateProjectSummaryOutput = await generateProjectSummary({ textDocumentContent: docText });
      setSummaryContent(result.summary);
      setIsSummaryDialogOpen(true);
    } catch (error) {
      console.error("AI summary error:", error);
      toast({ title: "AI Error", description: "Failed to generate summary. Please try again.", variant: "destructive" });
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full rounded-lg border bg-card text-card-foreground shadow-sm">
      <TipTapToolbar 
        editor={editor} 
        onAiEnhance={handleAiEnhance}
        onAutoFormat={handleAutoFormat}
        onSummarize={handleSummarize}
        isAiLoading={isAiLoading}
      />
      <EditorContent editor={editor} className="flex-grow h-full overflow-y-auto" />

      {/* AI Text Enhancement Dialog */}
      <AITextEnhancementDialog
        isOpen={isEnhanceDialogOpen}
        onOpenChange={setIsEnhanceDialogOpen}
        initialText={textForEnhancement}
        onApply={onApplyEnhancement}
      />

      {/* Summarize Document Dialog */}
      <Dialog open={isSummaryDialogOpen} onOpenChange={setIsSummaryDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Document Summary</DialogTitle>
            <DialogDescription>
              AI-generated summary of your document.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px] my-4">
            <Textarea
                value={summaryContent}
                readOnly
                rows={10}
                className="bg-muted/50 text-sm p-3"
            />
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSummaryDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

