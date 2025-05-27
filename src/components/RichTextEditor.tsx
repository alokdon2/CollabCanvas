
"use client";

import { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Sparkles,
  Pilcrow,
  AlignLeft,
  Loader2,
  Code, // For inline code
  SquareCode, // For code block
  Quote, // For blockquote
  Table as TableIcon, // For table
  Image as ImageIcon, // For image
  Minus, // For Divider
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from './ui/textarea';

// TipTap Extensions
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import ImageExtension from '@tiptap/extension-image';
import TableExtension from '@tiptap/extension-table';
import TableRowExtension from '@tiptap/extension-table-row';
import TableCellExtension from '@tiptap/extension-table-cell';
import TableHeaderExtension from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import HardBreak from '@tiptap/extension-hard-break';
import HorizontalRule from '@tiptap/extension-horizontal-rule';


// Lowlight and highlight.js for CodeBlockLowlight
import { createLowlight } from 'lowlight';
import javascript from 'highlight.js/lib/languages/javascript';
import css from 'highlight.js/lib/languages/css';
import html from 'highlight.js/lib/languages/xml'; // xml for html
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';
import cpp from 'highlight.js/lib/languages/cpp';
import php from 'highlight.js/lib/languages/php';
import shell from 'highlight.js/lib/languages/shell';
import markdown from 'highlight.js/lib/languages/markdown';

// Create a grammars map for lowlight
const grammars = {
  javascript,
  js: javascript,
  css,
  html,
  xml: html,
  typescript,
  ts: typescript,
  python,
  py: python,
  java,
  csharp,
  cs: csharp,
  cpp,
  php,
  shell,
  sh: shell,
  markdown,
  md: markdown,
};

const lowlightInstance = createLowlight(grammars);


interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
}

interface SlashCommand {
  label: string;
  icon: React.ElementType;
  action: (editor: Editor) => void;
}


const TipTapToolbar = ({
  editor,
  onAiEnhance,
  onAutoFormat,
  onSummarize,
  onInsertImage,
  isAiLoading,
}: {
  editor: Editor | null;
  onAiEnhance: () => void;
  onAutoFormat: () => void;
  onSummarize: () => void;
  onInsertImage: () => void;
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
        onClick={() => editor.chain().focus().toggleCode().run()}
        variant={editor.isActive('code') ? 'secondary' : 'ghost'}
        size="icon"
        title="Inline Code"
      >
        <Code className="h-4 w-4" />
      </Button>
      <div className="h-6 w-px bg-border mx-1"></div>
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
      <div className="h-6 w-px bg-border mx-1"></div>
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
      <Button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        variant={editor.isActive('blockquote') ? 'secondary' : 'ghost'}
        size="icon"
        title="Blockquote"
      >
        <Quote className="h-4 w-4" />
      </Button>
      <Button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        variant={editor.isActive('codeBlock') ? 'secondary' : 'ghost'}
        size="icon"
        title="Code Block"
      >
        <SquareCode className="h-4 w-4" />
      </Button>
       <Button
        onClick={() => editor.chain().focus().insertHorizontalRule().run()}
        variant={'ghost'}
        size="icon"
        title="Insert Divider"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Button
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        variant={'ghost'}
        size="icon"
        title="Insert Table"
      >
        <TableIcon className="h-4 w-4" />
      </Button>
      <Button
        onClick={onInsertImage}
        variant={'ghost'}
        size="icon"
        title="Insert Image"
      >
        <ImageIcon className="h-4 w-4" />
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

  const [isEnhanceDialogOpen, setIsEnhanceDialogOpen] = useState(false);
  const [textForEnhancement, setTextForEnhancement] = useState("");
  const [originalSelectionRange, setOriginalSelectionRange] = useState<{from: number, to: number} | null>(null);

  const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);
  const [summaryContent, setSummaryContent] = useState("");

  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  const [isSlashCommandMenuOpen, setIsSlashCommandMenuOpen] = useState(false);
  const slashCommandMenuTriggerRef = useRef<HTMLSpanElement>(null);


  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, 
        hardBreak: false, // Use HardBreak extension for more control if needed
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: "Start writing your document, or type '/ ' for commands...",
      }),
      CodeBlockLowlight.configure({
        lowlight: lowlightInstance,
        defaultLanguage: 'plaintext',
      }),
      ImageExtension,
      TableExtension.configure({
        resizable: true,
      }),
      TableRowExtension,
      TableCellExtension,
      TableHeaderExtension,
      HardBreak, // Allows Shift+Enter for hard breaks
      HorizontalRule, // For dividers
    ],
    content: value?.trim() ? value : "<p></p>",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      // Slash command trigger logic
      const { selection } = editor.state;
      if (selection.empty && selection.anchor > 1) {
        const textBeforeCursor = editor.state.doc.textBetween(selection.anchor - 2, selection.anchor, "\n");
        if (textBeforeCursor === "/ ") {
          if (!isSlashCommandMenuOpen) { // Only open if not already open
            setIsSlashCommandMenuOpen(true); // Removed setTimeout
          }
        } else {
          if (isSlashCommandMenuOpen) {
            setIsSlashCommandMenuOpen(false);
          }
        }
      } else {
        if (isSlashCommandMenuOpen) {
          setIsSlashCommandMenuOpen(false);
        }
      }
    },
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert max-w-none p-4 focus:outline-none h-full',
      },
    },
    autofocus: true,
  });

  useEffect(() => {
    if (editor) {
      const currentHTML = editor.getHTML();
      const newContent = value?.trim() ? value : "<p></p>";

      if (currentHTML !== newContent) {
        const { from, to } = editor.state.selection;
        editor.commands.setContent(newContent, false);
        if (editor.isFocused && newContent !== "<p></p>") {
           try {
              if (from <= editor.state.doc.content.size && to <= editor.state.doc.content.size) {
                editor.commands.setTextSelection({ from, to });
              } else {
                editor.commands.focus('end');
              }
           } catch (e) {
              editor.commands.focus('end');
           }
        }
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
        editor.chain().focus().setTextSelection(selection).deleteSelection().insertContent(result.formattedText).run();
      } else {
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
      const docText = editor.getText();
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

  const handleOpenImageDialog = () => {
    setImageUrl("");
    setIsImageDialogOpen(true);
  };

  const handleInsertImageFromDialog = () => {
    if (editor && imageUrl.trim()) {
      editor.chain().focus().setImage({ src: imageUrl }).run();
    }
    setIsImageDialogOpen(false);
  };

  const slashCommands: SlashCommand[] = editor ? [
    { label: 'Heading 1', icon: Heading1, action: (e) => e.chain().focus().setNode('heading', { level: 1 }).run() },
    { label: 'Heading 2', icon: Heading2, action: (e) => e.chain().focus().setNode('heading', { level: 2 }).run() },
    { label: 'Heading 3', icon: Heading3, action: (e) => e.chain().focus().setNode('heading', { level: 3 }).run() },
    { label: 'Bullet List', icon: List, action: (e) => e.chain().focus().toggleBulletList().run() },
    { label: 'Numbered List', icon: ListOrdered, action: (e) => e.chain().focus().toggleOrderedList().run() },
    { label: 'Blockquote', icon: Quote, action: (e) => e.chain().focus().toggleBlockquote().run() },
    { label: 'Code Block', icon: SquareCode, action: (e) => e.chain().focus().toggleCodeBlock().run() },
    { label: 'Divider', icon: Minus, action: (e) => e.chain().focus().setHorizontalRule().run() },
    { label: 'Table', icon: TableIcon, action: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { label: 'Image', icon: ImageIcon, action: () => handleOpenImageDialog() },
  ] : [];

  const executeSlashCommand = (commandAction: (editor: Editor) => void) => {
    if (!editor) return;
    // Delete the "/ " trigger
    const { from } = editor.state.selection;
    editor.chain().focus().deleteRange({ from: from - 2, to: from }).run();
    commandAction(editor);
    setIsSlashCommandMenuOpen(false);
  };


  return (
    <div className="flex flex-col h-full rounded-lg border bg-card text-card-foreground shadow-sm">
      <DropdownMenu open={isSlashCommandMenuOpen} onOpenChange={setIsSlashCommandMenuOpen}>
        <DropdownMenuTrigger ref={slashCommandMenuTriggerRef} asChild>
          {/* This span is a hidden trigger, the menu is controlled programmatically */}
          <span style={{ position: 'absolute', top: '-9999px', left: '-9999px' }} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-60"
          onCloseAutoFocus={(e) => editor?.commands.focus()} // Return focus to editor
        >
          {slashCommands.map((command, index) => (
            <DropdownMenuItem
              key={index}
              onSelect={() => executeSlashCommand(command.action)}
              className="flex items-center gap-2"
            >
              <command.icon className="h-4 w-4" />
              <span>{command.label}</span>
            </DropdownMenuItem>
          ))}
          {slashCommands.length === 0 && <DropdownMenuItem disabled>No commands found</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      
      <TipTapToolbar
        editor={editor}
        onAiEnhance={handleAiEnhance}
        onAutoFormat={handleAutoFormat}
        onSummarize={handleSummarize}
        onInsertImage={handleOpenImageDialog}
        isAiLoading={isAiLoading}
      />
      <EditorContent editor={editor} className="flex-grow h-full overflow-y-auto" />

      <AITextEnhancementDialog
        isOpen={isEnhanceDialogOpen}
        onOpenChange={setIsEnhanceDialogOpen}
        initialText={textForEnhancement}
        onApply={onApplyEnhancement}
      />

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

      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Insert Image</DialogTitle>
            <DialogDescription>
              Enter the URL of the image you want to insert.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label htmlFor="imageUrl">Image URL</Label>
            <Input
              id="imageUrl"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.png"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImageDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleInsertImageFromDialog} disabled={!imageUrl.trim()}>Insert Image</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

