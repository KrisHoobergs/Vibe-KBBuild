"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { editorExtensions } from "../extensions";

interface ArticleRendererProps {
  content: Record<string, unknown>;
}

export function ArticleRenderer({ content }: ArticleRendererProps) {
  const editor = useEditor({
    extensions: editorExtensions,
    content: Object.keys(content).length > 0 ? content : undefined,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-neutral dark:prose-invert max-w-none focus:outline-none",
      },
    },
  });

  // Zorg dat content altijd correct wordt ingesteld nadat de editor is aangemaakt
  useEffect(() => {
    if (editor && !editor.isDestroyed && Object.keys(content).length > 0) {
      // Vergelijk of content verschilt van wat de editor momenteel heeft
      const currentContent = editor.getJSON();
      if (JSON.stringify(currentContent) !== JSON.stringify(content)) {
        editor.commands.setContent(content);
      }
    }
  }, [editor, content]);

  if (!editor) return null;

  return <EditorContent editor={editor} />;
}
