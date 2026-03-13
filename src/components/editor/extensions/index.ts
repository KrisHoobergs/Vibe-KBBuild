import StarterKit from "@tiptap/starter-kit";
import { ResizableImage } from "./resizable-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

export const editorExtensions = [
  StarterKit.configure({
    codeBlock: false, // We use CodeBlockLowlight instead
    link: false, // We configure Link separately below
    underline: false, // We configure Underline separately below
  }),
  ResizableImage.configure({
    inline: false,
    allowBase64: true,
    HTMLAttributes: {
      class: "rounded-md max-w-full",
    },
  }),
  Link.configure({
    openOnClick: false,
    HTMLAttributes: {
      class: "text-primary underline",
    },
  }),
  Placeholder.configure({
    placeholder: "Begin met schrijven, of typ / voor opties...",
  }),
  Underline,
  CodeBlockLowlight.configure({
    lowlight,
    HTMLAttributes: {
      class: "rounded-md bg-muted p-4 font-mono text-sm",
    },
  }),
];
