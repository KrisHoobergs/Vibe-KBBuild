import Image, { type ImageOptions } from "@tiptap/extension-image";
import { mergeAttributes } from "@tiptap/core";

// Server-safe variant zonder NodeView, voor generateHTML (mail, printweergave,
// leesweergave). Staat in een eigen bestand omdat resizable-image.ts
// @tiptap/react en de React-component importeert, wat in een server component
// niet laadbaar is.

type Opties = ImageOptions & {
  /**
   * Dezelfde opbouw als de NodeView in de editor (een blok met daarin een
   * inline-block), zodat de ruimte rond afbeeldingen in de leesweergave gelijk
   * is aan die in de editor. Voor mail en afdrukken: gewoon een <img>.
   */
  zoalsEditor: boolean;
};

export const ResizableImageServer = Image.extend<Opties>({
  addOptions() {
    return { ...this.parent!(), zoalsEditor: false };
  },

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

  renderHTML({ node, HTMLAttributes }) {
    const attrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
    if (!this.options.zoalsEditor) return ["img", attrs];

    // Zoals ResizableImageComponent: de breedte op de container, de afbeelding
    // vult die. Alleen een getal als breedte (geen vrije CSS uit de inhoud).
    const breedte = Number(node.attrs.width);
    const { src, alt, title, loading, decoding } = attrs;
    return [
      "div",
      { class: "resizable-image-wrapper" },
      [
        "div",
        {
          style: `position: relative; display: inline-block; max-width: 100%;${
            breedte > 0 ? ` width: ${Math.round(breedte)}px;` : ""
          }`,
        },
        [
          "img",
          { src, alt, title, loading, decoding, class: "rounded-md", style: "display: block; width: 100%; height: auto;" },
        ],
      ],
    ];
  },
});
