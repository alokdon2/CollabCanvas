
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
  Sparkles, // Used for AI Enhance
  Pilcrow, // Used for Auto-Format
  Loader2,
  Code, 
  SquareCode, 
  Quote, 
  Table as TableIcon, 
  Image as ImageIcon, 
  Minus, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify, 
  ListCollapse, // Used for Summarize
  MessageSquareQuestion, // New icon for Ask AI
} from "lucide-react";
import { AITextEnhancementDialog } from "./AITextEnhancementDialog";
import { AskAiDialog } from "./AskAiDialog"; // Added AskAiDialog
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
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from './ui/textarea';
import { cn } from '@/lib/utils';
import { Separator } from "@/components/ui/separator";

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
import TextAlign from '@tiptap/extension-text-align';

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
  onAskAi, // Added onAskAi
  onInsertImage,
  isAiLoading,
  activeAiTool,
}: {
  editor: Editor | null;
  onAiEnhance: () => void;
  onAutoFormat: () => void;
  onSummarize: () => void;
  onAskAi: () => void; // Added onAskAi
  onInsertImage: () => void;
  isAiLoading: boolean;
  activeAiTool: string | null;
}) => {
  if (!editor) {
    return null;
  }

  return (
    <div className="p-2 m-2 rounded-lg shadow-xl bg-background/90 backdrop-blur-sm flex items-center gap-1 flex-wrap sticky top-2 z-10">
      {/* Formatting Group */}
      <div className="flex items-center gap-1 flex-wrap">
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
      </div>
      
      <Separator orientation="vertical" className="h-6 mx-1 bg-border" />
      
      {/* Alignment Group */}
      <div className="flex items-center gap-1 flex-wrap">
        <Button
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          variant={editor.isActive({ textAlign: 'left' }) ? 'secondary' : 'ghost'}
          size="icon"
          title="Align Left"
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          variant={editor.isActive({ textAlign: 'center' }) ? 'secondary' : 'ghost'}
          size="icon"
          title="Align Center"
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          variant={editor.isActive({ textAlign: 'right' }) ? 'secondary' : 'ghost'}
          size="icon"
          title="Align Right"
        >
          <AlignRight className="h-4 w-4" />
        </Button>
        <Button
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          variant={editor.isActive({ textAlign: 'justify' }) ? 'secondary' : 'ghost'}
          size="icon"
          title="Align Justify"
        >
          <AlignJustify className="h-4 w-4" />
        </Button>
      </div>
      
      <Separator orientation="vertical" className="h-6 mx-1 bg-border" />
      
      {/* Block Elements Group */}
      <div className="flex items-center gap-1 flex-wrap">
         <Button
          onClick={() => editor.chain().focus().toggleCode().run()}
          variant={editor.isActive('code') ? 'secondary' : 'ghost'}
          size="icon"
          title="Inline Code"
        >
          <Code className="h-4 w-4" />
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
      </div>
      
      <Separator orientation="vertical" className="h-6 mx-1 bg-border" />
      
      {/* AI Tools Group */}
      <div className="flex items-center gap-1 flex-wrap">
        <Button
          onClick={onAskAi} // Added Ask AI button
          variant="ghost"
          size="icon"
          title="Ask AI"
          disabled={isAiLoading}
        >
          {isAiLoading && activeAiTool === 'askAi' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareQuestion className="h-4 w-4" />}
        </Button>
        <Button
          onClick={onAiEnhance}
          variant="ghost"
          size="icon"
          title="AI Enhance Text"
          disabled={isAiLoading}
        >
          {isAiLoading && activeAiTool === 'aiEnhance' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        </Button>
        <Button
          onClick={onAutoFormat}
          variant="ghost"
          size="icon"
          title="AI Auto-Format"
          disabled={isAiLoading}
        >
           {isAiLoading && activeAiTool === 'aiAutoFormat' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pilcrow className="h-4 w-4" />}
        </Button>
        <Button
          onClick={onSummarize}
          variant="ghost"
          size="icon"
          title="Summarize Document"
          disabled={isAiLoading}
        >
          {isAiLoading && activeAiTool === 'aiSummarize' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListCollapse className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const { toast } = useToast();
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeAiTool, setActiveAiTool] = useState<string | null>(null);


  const [isEnhanceDialogOpen, setIsEnhanceDialogOpen] = useState(false);
  const [textForEnhancement, setTextForEnhancement] = useState("");
  const [originalSelectionRange, setOriginalSelectionRange] = useState<{from: number, to: number} | null>(null);

  const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);
  const [summaryContent, setSummaryContent] = useState("");

  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  const [isAskAiDialogOpen, setIsAskAiDialogOpen] = useState(false); // State for Ask AI dialog
  const [initialQueryForAskAi, setInitialQueryForAskAi] = useState(""); // State for Ask AI initial query

  const [isSlashCommandMenuOpen, setIsSlashCommandMenuOpen] = useState(false);
  const [slashCommandAnchorPos, setSlashCommandAnchorPos] = useState<{ top: number; left: number } | null>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  
  const commandButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuContentRef = useRef<HTMLDivElement>(null);
  const [focusedCommandIndex, setFocusedCommandIndex] = useState(0);


  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, 
        hardBreak: false, 
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
      HardBreak, 
      HorizontalRule,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: value?.trim() && value !== "<p></p>" ? value : "<p></p>",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      const { selection } = editor.state;
      const { from, to } = selection;

      if (selection.empty && from > 1 && !isSlashCommandMenuOpen) { 
        const textBeforeCursor = editor.state.doc.textBetween(from - 2, from, "\n");
        if (textBeforeCursor === "/ ") {
          const coords = editor.view.coordsAtPos(from);
          const wrapperRect = editorWrapperRef.current?.getBoundingClientRect();

          if (wrapperRect) {
            const anchorTop = coords.bottom - wrapperRect.top;
            const anchorLeft = coords.left - wrapperRect.left;
            setSlashCommandAnchorPos({ top: anchorTop, left: anchorLeft });
          } else {
            setSlashCommandAnchorPos({ top: coords.bottom, left: coords.left });
          }
          
          editor.chain().focus().deleteRange({ from: from - 2, to }).run();
          setFocusedCommandIndex(0); 
          setIsSlashCommandMenuOpen(true);
          return; 
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
    { label: 'Align Left', icon: AlignLeft, action: (e) => e.chain().focus().setTextAlign('left').run() },
    { label: 'Align Center', icon: AlignCenter, action: (e) => e.chain().focus().setTextAlign('center').run() },
    { label: 'Align Right', icon: AlignRight, action: (e) => e.chain().focus().setTextAlign('right').run() },
    { label: 'Align Justify', icon: AlignJustify, action: (e) => e.chain().focus().setTextAlign('justify').run() },
  ] : [];
  
  useEffect(() => {
    commandButtonRefs.current = Array(slashCommands.length).fill(null);
  }, [slashCommands.length]);

  useEffect(() => {
    if (isSlashCommandMenuOpen && menuContentRef.current) {
      menuContentRef.current.focus(); 
      if (commandButtonRefs.current[focusedCommandIndex]) {
        commandButtonRefs.current[focusedCommandIndex]?.focus();
      }
    }
  }, [isSlashCommandMenuOpen, focusedCommandIndex, slashCommands]);


  useEffect(() => {
    if (editor) {
      const currentHTML = editor.getHTML();
      const newContent = value?.trim() && value !== "<p></p>" ? value : "<p></p>";

      if (currentHTML !== newContent) {
        const { from, to } = editor.state.selection;
        editor.commands.setContent(newContent, false);
        if (editor.isFocused) { 
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
    setActiveAiTool('aiEnhance'); 
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
    setActiveAiTool(null);
  };

  const handleAutoFormat = async () => {
    if (!editor) return;
    const { text, selection } = getTextForAI();
     if (!text.trim()) {
      toast({ title: "Nothing to format", description: "Please select text or ensure the document has content.", variant: "destructive" });
      return;
    }
    setIsAiLoading(true);
    setActiveAiTool('aiAutoFormat');
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
      setActiveAiTool(null);
    }
  };

  const handleSummarize = async () => {
    if (!editor || !editor.getText().trim()) {
       toast({ title: "Document is empty", description: "Cannot summarize an empty document.", variant: "destructive" });
      return;
    }
    setIsAiLoading(true);
    setActiveAiTool('aiSummarize');
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
      setActiveAiTool(null);
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

  const handleAskAi = () => {
    if (!editor) return;
    const { text, selection } = getTextForAI();
    // If there's selected text, use it as the initial query. Otherwise, start with an empty query.
    setInitialQueryForAskAi(selection ? text : ""); 
    setOriginalSelectionRange(selection); // Store selection to replace if user inserts
    setActiveAiTool('askAi');
    setIsAskAiDialogOpen(true);
  };

  const handleInsertAskAiResponse = (responseText: string) => {
    if (!editor) return;
    if (originalSelectionRange) { // If there was an initial selection
      editor.chain().focus().setTextSelection(originalSelectionRange).deleteSelection().insertContent(responseText).run();
    } else { // Otherwise, insert at current cursor
      editor.chain().focus().insertContent(responseText).run();
    }
    toast({ title: "AI Response Inserted", description: "Text generated by AI has been added to the editor." });
    setActiveAiTool(null);
  };
  
  const executeSlashCommand = (commandAction: (editor: Editor) => void) => {
    if (!editor) return;
    commandAction(editor);
    setIsSlashCommandMenuOpen(false); 
  };

  const handleSlashCommandKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isSlashCommandMenuOpen || slashCommands.length === 0) return;
  
    let newIndex = focusedCommandIndex;
  
    if (event.key === "ArrowDown") {
      event.preventDefault();
      newIndex = (focusedCommandIndex + 1) % slashCommands.length;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      newIndex = (focusedCommandIndex - 1 + slashCommands.length) % slashCommands.length;
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (commandButtonRefs.current[focusedCommandIndex]) {
        commandButtonRefs.current[focusedCommandIndex]?.click();
        setIsSlashCommandMenuOpen(false); // Close menu on enter
      }
      return; 
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsSlashCommandMenuOpen(false);
      return;
    }
  
    if (newIndex !== focusedCommandIndex) {
      setFocusedCommandIndex(newIndex);
    }
  };

  useEffect(() => {
    // For AI loading states, to remove the active class from the editor if dialog is closed without applying
    if (activeAiTool === 'aiEnhance' && !isEnhanceDialogOpen) {
        setActiveAiTool(null);
    }
    if (activeAiTool === 'aiSummarize' && !isSummaryDialogOpen) {
        setActiveAiTool(null);
    }
    if (activeAiTool === 'askAi' && !isAskAiDialogOpen) { // Added for Ask AI
        setActiveAiTool(null);
    }
  }, [isEnhanceDialogOpen, isSummaryDialogOpen, isAskAiDialogOpen, activeAiTool]);


  return (
    <div ref={editorWrapperRef} className={cn(
        "relative flex flex-col items-center h-full rounded-lg border bg-card text-card-foreground shadow-sm"
    )}>
      <Popover open={isSlashCommandMenuOpen} onOpenChange={setIsSlashCommandMenuOpen}>
        <PopoverAnchor
          style={{
            position: 'absolute',
            top: `${slashCommandAnchorPos?.top ?? 0}px`,
            left: `${slashCommandAnchorPos?.left ?? 0}px`,
            width: 0,
            height: 0,
          }}
        />
        <PopoverContent
          className="w-60 p-1" 
          sideOffset={5}
          align="start"
          onCloseAutoFocus={() => editor?.chain().focus().run()}
        >
          <div
            ref={menuContentRef}
            tabIndex={-1}
            onKeyDown={handleSlashCommandKeyDown}
            className="focus:outline-none"
          >
            {slashCommands.map((command, index) => (
              <button
                key={command.label} 
                ref={(el) => (commandButtonRefs.current[index] = el)}
                onClick={() => executeSlashCommand(command.action)}
                className={cn(
                  "flex items-center gap-2 w-full p-2 text-sm rounded-sm focus:outline-none",
                  index === focusedCommandIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/80"
                )}
                tabIndex={-1} 
              >
                <command.icon className="h-4 w-4" />
                <span>{command.label}</span>
              </button>
            ))}
            {slashCommands.length === 0 && (
              <div className="p-2 text-sm text-muted-foreground">No commands available</div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      
      <TipTapToolbar
        editor={editor}
        onAiEnhance={handleAiEnhance}
        onAutoFormat={handleAutoFormat}
        onSummarize={handleSummarize}
        onAskAi={handleAskAi} // Passed handler
        onInsertImage={handleOpenImageDialog}
        isAiLoading={isAiLoading}
        activeAiTool={activeAiTool}
      />
      <EditorContent editor={editor} className="flex-grow h-full overflow-y-auto w-full" />

      <AITextEnhancementDialog
        isOpen={isEnhanceDialogOpen}
        onOpenChange={(isOpen) => {
            setIsEnhanceDialogOpen(isOpen);
            if (!isOpen && activeAiTool === 'aiEnhance') setActiveAiTool(null);
        }}
        initialText={textForEnhancement}
        onApply={onApplyEnhancement}
      />

      <AskAiDialog
        isOpen={isAskAiDialogOpen}
        onOpenChange={(isOpen) => {
            setIsAskAiDialogOpen(isOpen);
            if (!isOpen && activeAiTool === 'askAi') setActiveAiTool(null);
        }}
        initialQuery={initialQueryForAskAi}
        onInsertResponse={handleInsertAskAiResponse}
      />

      <Dialog open={isSummaryDialogOpen} onOpenChange={(isOpen) => {
        setIsSummaryDialogOpen(isOpen);
        if (!isOpen && activeAiTool === 'aiSummarize') setActiveAiTool(null);
      }}>
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
            <Button variant="outline" onClick={() => {
                setIsSummaryDialogOpen(false);
                if (activeAiTool === 'aiSummarize') setActiveAiTool(null);
            }}>Close</Button>
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
