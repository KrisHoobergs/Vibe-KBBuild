import type { EditorProps, EditorView } from "@tiptap/pm/view";
import { toast } from "sonner";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/constants";
import { uploadBestand } from "@/lib/storage/client-upload";

// Geplakte en gesleepte afbeeldingen gaan als bestand naar de opslag, net als
// via de knop in de werkbalk. Anders komen ze als base64-tekst in het artikel
// terecht, en dat maakt elk artikel zwaar om te openen.
//
// Alleen nieuw geplakte of gesleepte inhoud: afbeeldingen die al in een
// artikel staan, blijven ongemoeid.

type Opties = {
  /** Map in de opslag (artikel-id, of "temp" voor een nieuw artikel). */
  articleId: string;
  /** Toont "Bestand wordt geüpload..." zolang er iets bezig is. */
  zetBezig: (bezig: boolean) => void;
};

function afbeeldingen(lijst: FileList | null | undefined): File[] {
  return Array.from(lijst ?? []).filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));
}

/** Een data:-URI van een afbeelding als bestand, of null als het iets anders is. */
async function dataUriNaarBestand(uri: string): Promise<File | null> {
  const type = uri.match(/^data:([^;,]+);base64,/)?.[1];
  if (!type || !ACCEPTED_IMAGE_TYPES.includes(type)) return null;
  const blob = await (await fetch(uri)).blob();
  return new File([blob], `geplakt.${type.split("/")[1].replace("jpeg", "jpg")}`, { type });
}

async function uploadEnVoegIn(view: EditorView, bestanden: File[], pos: number | null, o: Opties) {
  o.zetBezig(true);
  try {
    for (const bestand of bestanden) {
      const resultaat = await uploadBestand(bestand, "afbeelding", o.articleId);
      if (!resultaat.success || !resultaat.data) {
        toast.error(resultaat.error ?? "Afbeelding uploaden mislukt");
        continue;
      }
      if (view.isDestroyed) return;
      const node = view.state.schema.nodes.image.create({ src: resultaat.data.url });
      const tr =
        pos === null
          ? view.state.tr.replaceSelectionWith(node)
          : view.state.tr.replaceRangeWith(Math.min(pos, view.state.doc.content.size), Math.min(pos, view.state.doc.content.size), node);
      view.dispatch(tr.scrollIntoView());
      // Meerdere bestanden: de volgende na de vorige.
      if (pos !== null) pos = tr.mapping.map(pos);
    }
  } finally {
    o.zetBezig(false);
  }
}

/** Vervangt de base64-afbeeldingen die net geplakt zijn door geüploade bestanden. */
async function vervangDataUris(view: EditorView, uris: string[], o: Opties) {
  o.zetBezig(true);
  try {
    for (const uri of uris) {
      const bestand = await dataUriNaarBestand(uri);
      const resultaat = bestand ? await uploadBestand(bestand, "afbeelding", o.articleId) : null;
      if (!resultaat?.success || !resultaat.data) {
        toast.error(
          `Een geplakte afbeelding kon niet geüpload worden en staat nu in de tekst zelf${resultaat?.error ? ` (${resultaat.error})` : ""}.`
        );
        continue;
      }
      if (view.isDestroyed) return;
      const url = resultaat.data.url;
      const tr = view.state.tr;
      view.state.doc.descendants((node, pos) => {
        if (node.type.name === "image" && node.attrs.src === uri) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: url });
        }
      });
      // Geen eigen stap in de geschiedenis: ongedaan maken haalt gewoon het plakken weg.
      if (tr.docChanged) view.dispatch(tr.setMeta("addToHistory", false));
    }
  } finally {
    o.zetBezig(false);
  }
}

export function geplakteAfbeeldingen(o: Opties): Pick<EditorProps, "handlePaste" | "handleDrop" | "transformPasted"> {
  return {
    // Een afbeelding uit het klembord (bv. een schermafbeelding): uploaden.
    // Zit er ook tekst bij (bv. een stuk uit Word), dan gewoon plakken.
    handlePaste(view, event) {
      const bestanden = afbeeldingen(event.clipboardData?.files);
      if (bestanden.length === 0 || event.clipboardData?.getData("text/plain").trim()) return false;
      event.preventDefault();
      void uploadEnVoegIn(view, bestanden, null, o);
      return true;
    },

    // Afbeeldingsbestanden die in de editor gesleept worden: uploaden op de plek waar ze neerkomen.
    handleDrop(view, event, _slice, moved) {
      if (moved) return false;
      const bestanden = afbeeldingen(event.dataTransfer?.files);
      if (bestanden.length === 0) return false;
      event.preventDefault();
      const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null;
      void uploadEnVoegIn(view, bestanden, pos, o);
      return true;
    },

    // Geplakte HTML met base64-afbeeldingen (bv. uit een webpagina of chat):
    // eerst gewoon plakken, daarna de afbeeldingen uploaden en vervangen.
    transformPasted(slice, view) {
      const uris = new Set<string>();
      slice.content.descendants((node) => {
        const src = node.attrs.src;
        if (node.type.name === "image" && typeof src === "string" && src.startsWith("data:")) uris.add(src);
      });
      if (uris.size > 0) setTimeout(() => void vervangDataUris(view, [...uris], o), 0);
      return slice;
    },
  };
}
