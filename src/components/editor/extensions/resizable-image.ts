import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ResizableImageComponent } from "./resizable-image-component";
import { mergeAttributes } from "@tiptap/core";

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute("width") || element.style.width;
          return width ? parseInt(width, 10) || null : null;
        },
        renderHTML: (attributes) => {
          // Alleen een getal: de inhoud mag geen vrije CSS in de stijl zetten.
          const breedte = Number(attributes.width);
          if (!(breedte > 0)) return {};
          return {
            style: `width: ${Math.round(breedte)}px; max-width: 100%;`,
          };
        },
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

// De server-safe variant (voor generateHTML) staat in resizable-image-server.ts,
// zodat server components dit bestand — met zijn @tiptap/react-import — niet laden.
