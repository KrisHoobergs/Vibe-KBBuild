import Image from "@tiptap/extension-image";
import { mergeAttributes } from "@tiptap/core";

// Server-safe variant zonder NodeView, voor generateHTML (mail, printweergave).
// Staat in een eigen bestand omdat resizable-image.ts @tiptap/react en de
// React-component importeert, wat in een server component niet laadbaar is.
export const ResizableImageServer = Image.extend({
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
          if (!attributes.width) return {};
          return {
            style: `width: ${attributes.width}px; max-width: 100%;`,
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
});
