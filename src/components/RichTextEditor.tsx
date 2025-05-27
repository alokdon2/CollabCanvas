
"use client";

import { useEffect } from 'react';
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
} from "lucide-react";
// AI-related imports and dialogs are temporarily removed
// import { Sparkles, AlignLeft, Loader2, Pilcrow } from "lucide-react";
// import { AITextEnhancementDialog } from "./AITextEnhancementDialog";
// import { generateProjectSummary, type GenerateProjectSummaryOutput } from "@/ai/flows/generate-project-summary";
// import { autoFormatText, type AutoFormatTextOutput } from "@/ai/flows/autoformat-text-flow";
// import { useToast } from "@/hooks/use-toast";
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import { ScrollArea } from '@/components/ui/scroll-area';

interface RichTextEditorProps {
  value: string; // Now expects HTML string
  onChange: (value: string) => void; // Will emit HTML string
  // onEnhancedText is removed as AI features are temporarily disabled
}

const TipTapToolbar = ({ editor }: { editor: Editor | null }) => {
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
      {/* TODO: Re-integrate AI features, adapting them for TipTap's HTML content and selection API. */}
    </div>
  );
};

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  // const { toast } = useToast(); // Temporarily removed
  
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable default h1, h2, h3 if you want more control or different styles
        // heading: {
        //   levels: [1, 2, 3],
        // },
      }),
    ],
    content: value, // Initial content (HTML string)
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        // Apply Tailwind Typography styles for nice default formatting
        // prose-sm sm:prose lg:prose-lg xl:prose-xl
        class: 'prose dark:prose-invert max-w-none p-4 focus:outline-none h-full', 
      },
    },
  });

  // Effect to update editor content if the external `value` prop changes
  // This is important if the content can be changed programmatically (e.g., by AI later)
  useEffect(() => {
    if (editor) {
      const isSame = editor.getHTML() === value;
      if (isSame) {
        return;
      }
      // To prevent infinite loop and preserve cursor position better,
      // TipTap's setContent should be used carefully.
      // The `false` argument prevents `onUpdate` from firing for this change.
      const { from, to } = editor.state.selection;
      editor.commands.setContent(value, false);
      // Try to restore selection, might not be perfect for all cases
      editor.commands.setTextSelection({ from, to });

    }
  }, [value, editor]);


  return (
    <div className="flex flex-col h-full rounded-lg border bg-card text-card-foreground shadow-sm">
      <TipTapToolbar editor={editor} />
      <EditorContent editor={editor} className="flex-grow h-full overflow-y-auto" />
      {/* AI Dialogs and Summary Dialog are temporarily removed */}
    </div>
  );
}
