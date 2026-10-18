import { Extension } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { dropPoint } from "@tiptap/pm/transform";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { toast } from "sonner";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/constants";
import { uploadBestand } from "@/lib/storage/client-upload";
import type { ActionResult } from "@/types";

// Geplakte en gesleepte afbeeldingen gaan als bestand naar de opslag, net als
// via de knop in de werkbalk. Anders komen ze als base64-tekst in het artikel
// terecht, en dat maakt elk artikel zwaar om te openen.
//
// Alleen nieuw geplakte of gesleepte inhoud. Afbeeldingen die al in een
// artikel staan, blijven ongemoeid (behalve als je er een kopieert en weer
// plakt: dan wordt ze, net als elke geplakte afbeelding, een bestand).

export type GeplakteAfbeeldingenOpties = {
  /** Map in de opslag (artikel-id, of "temp" voor een nieuw artikel). */
  articleId: string;
  /** Meldt het begin (true) en het einde (false) van elke upload. */
  zetBezig: (bezig: boolean) => void;
};

const SOORTEN = ACCEPTED_IMAGE_TYPES.join(", ").replace(/image\//g, "").toUpperCase();

function afbeeldingen(lijst: FileList | null | undefined): { geschikt: File[]; ongeschikt: boolean } {
  const alle = Array.from(lijst ?? []).filter((f) => f.type.startsWith("image/"));
  const geschikt = alle.filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));
  return { geschikt, ongeschikt: alle.length > geschikt.length };
}

/** Een data:-URI van een afbeelding als bestand, of null als het type niet ondersteund is. */
async function dataUriNaarBestand(uri: string): Promise<File | null> {
  let type = uri.match(/^data:([^;,]+);base64,/)?.[1]?.toLowerCase();
  if (type === "image/jpg") type = "image/jpeg";
  if (!type || !ACCEPTED_IMAGE_TYPES.includes(type)) return null;
  const blob = await (await fetch(uri)).blob();
  return new File([blob], `geplakt.${type.split("/")[1].replace("jpeg", "jpg")}`, { type });
}

// De plek waar een afbeelding komt die nog geüpload wordt: een decoratie die bij
// elke wijziging meeschuift (zoals het upload-voorbeeld van ProseMirror). Zo
// komt de afbeelding waar ze geplakt of neergezet werd, ook als je intussen
// verder typt of ergens anders klikt.
const plekken = new PluginKey<DecorationSet>("geplakteAfbeeldingen");
type Plek = { id: object };
type Actie = { voegToe?: { id: object; pos: number }; haalWeg?: object };

function plaatshouder() {
  const el = document.createElement("span");
  el.className = "afbeelding-upload";
  el.textContent = "Afbeelding wordt geüpload…";
  return el;
}

function zoekPlek(view: EditorView, id: object): number | null {
  const gevonden = plekken.getState(view.state)?.find(undefined, undefined, (s) => (s as Plek).id === id);
  return gevonden?.length ? gevonden[0].from : null;
}

async function uploadEnVoegIn(
  view: EditorView,
  bestanden: File[],
  pos: number | null,
  o: GeplakteAfbeeldingenOpties
) {
  // De plek nu vastleggen: plakken vervangt meteen de selectie, slepen
  // gebruikt de dichtstbijzijnde geldige plek bij de muis.
  const tr = view.state.tr;
  if (pos === null) {
    tr.deleteSelection();
    pos = tr.selection.from;
  } else {
    const voorbeeld = view.state.schema.nodes.image.create({ src: "" });
    pos = dropPoint(tr.doc, pos, new Slice(Fragment.from(voorbeeld), 0, 0)) ?? pos;
  }
  const id = {};
  view.dispatch(tr.setMeta(plekken, { voegToe: { id, pos } } satisfies Actie));
  o.zetBezig(true);
  try {
    for (const bestand of bestanden) {
      const resultaat = await uploadBestand(bestand, "afbeelding", o.articleId);
      if (view.isDestroyed) return;
      if (!resultaat.success || !resultaat.data) {
        toast.error(resultaat.error ?? "Afbeelding uploaden mislukt");
        continue;
      }
      const p = zoekPlek(view, id);
      if (p === null) return; // de plek is intussen weggeknipt
      // De plaatshouder schuift mee voorbij de ingevoegde afbeelding, dus de
      // volgende komt er netjes achter.
      const node = view.state.schema.nodes.image.create({ src: resultaat.data.url });
      view.dispatch(view.state.tr.replaceRangeWith(p, p, node));
    }
  } finally {
    o.zetBezig(false);
    if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(plekken, { haalWeg: id } satisfies Actie));
  }
}

/** Vervangt net geplakte base64-afbeeldingen door geüploade bestanden. */
async function vervangDataUris(view: EditorView, uris: string[], o: GeplakteAfbeeldingenOpties) {
  try {
    for (const uri of uris) {
      const bestand = await dataUriNaarBestand(uri);
      const resultaat: ActionResult<{ url: string }> = bestand
        ? await uploadBestand(bestand, "afbeelding", o.articleId)
        : { success: false, error: `alleen ${SOORTEN}` };
      if (view.isDestroyed) return;
      if (!resultaat.success || !resultaat.data) {
        toast.error(
          `Een geplakte afbeelding kon niet geüpload worden en staat nu in de tekst zelf${resultaat.error ? ` (${resultaat.error})` : ""}.`
        );
        continue;
      }
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

/**
 * Gewoon plakken of neerzetten laten gebeuren, en daarna de base64-afbeeldingen
 * uit die inhoud uploaden (bv. HTML uit een webpagina of chat).
 */
function vervangNaInvoegen(view: EditorView, slice: Slice, o: GeplakteAfbeeldingenOpties): false {
  const uris = new Set<string>();
  slice.content.descendants((node) => {
    const src = node.attrs.src;
    if (node.type.name === "image" && typeof src === "string" && src.startsWith("data:")) uris.add(src);
  });
  if (uris.size > 0) {
    // Meteen als bezig melden, zodat opslaan wacht (het uploaden zelf start pas
    // na het invoegen).
    o.zetBezig(true);
    setTimeout(() => void vervangDataUris(view, [...uris], o), 0);
  }
  return false;
}

export const GeplakteAfbeeldingen = Extension.create<GeplakteAfbeeldingenOpties>({
  name: "geplakteAfbeeldingen",
  // Vóór de plak-afhandeling van andere extensies (bv. Link).
  priority: 1000,

  addOptions() {
    return { articleId: "temp", zetBezig: () => {} };
  },

  addProseMirrorPlugins() {
    const o = this.options;
    return [
      new Plugin<DecorationSet>({
        key: plekken,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            set = set.map(tr.mapping, tr.doc);
            const actie = tr.getMeta(plekken) as Actie | undefined;
            if (actie?.voegToe) {
              const { id, pos } = actie.voegToe;
              set = set.add(tr.doc, [Decoration.widget(pos, plaatshouder, { id } satisfies Plek)]);
            }
            if (actie?.haalWeg) {
              set = set.remove(set.find(undefined, undefined, (s) => (s as Plek).id === actie.haalWeg));
            }
            return set;
          },
        },
        props: {
          decorations: (state) => plekken.getState(state),

          // Een afbeelding uit het klembord (bv. een schermafbeelding): uploaden.
          // Zit er ook tekst bij (bv. een stuk uit Word), dan gewoon plakken.
          handlePaste(view, event, slice) {
            const { geschikt, ongeschikt } = afbeeldingen(event.clipboardData?.files);
            const tekst = event.clipboardData?.getData("text/plain").trim();
            if (geschikt.length === 0 || tekst) {
              if (ongeschikt && !tekst && geschikt.length === 0) toast.error(`Alleen afbeeldingen in ${SOORTEN} kunnen geplakt worden.`);
              return vervangNaInvoegen(view, slice, o);
            }
            event.preventDefault();
            void uploadEnVoegIn(view, geschikt, null, o);
            return true;
          },

          // Afbeeldingsbestanden die in de editor gesleept worden: uploaden op
          // de plek waar ze neerkomen. Slepen binnen de editor blijft gewoon slepen.
          handleDrop(view, event, slice) {
            if (view.dragging) return false;
            const { geschikt } = afbeeldingen(event.dataTransfer?.files);
            if (geschikt.length === 0) return vervangNaInvoegen(view, slice, o);
            event.preventDefault();
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null;
            void uploadEnVoegIn(view, geschikt, pos ?? view.state.selection.from, o);
            return true;
          },
        },
      }),
    ];
  },
});
