import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { ResizableImageServer } from "./resizable-image-server";

const lowlight = createLowlight(common);

/**
 * Extensielijst voor server-side generateHTML (mail, printweergave).
 * Moet inhoudelijk gelijk lopen met editorExtensions in ./index.ts, maar
 * zonder editor-only onderdelen (Placeholder, NodeViews). Codeblokken krijgen
 * inline styles zodat ze ook in e-mailclients zonder stylesheet leesbaar zijn.
 */
export const serverExtensions = [
  StarterKit.configure({
    codeBlock: false, // CodeBlockLowlight hieronder
    link: false, // Link hieronder
    underline: false, // Underline hieronder
  }),
  ResizableImageServer.configure({
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
  Underline,
  TextStyle,
  Color,
  Highlight.configure({
    multicolor: true,
  }),
  CodeBlockLowlight.configure({
    lowlight,
    HTMLAttributes: {
      class: "rounded-md bg-muted p-4 font-mono text-sm",
      style:
        "background-color: #f3f4f6; border-radius: 6px; padding: 16px; font-family: ui-monospace, monospace; font-size: 13px; overflow-x: auto;",
    },
  }),
];
