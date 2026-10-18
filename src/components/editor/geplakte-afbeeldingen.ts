import { Extension } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { dropPoint, insertPoint } from "@tiptap/pm/transform";
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

function afbeeldingen(lijst: FileList | null | undefined): { geschikt: File[]; ongeschikt: number } {
  const alle = Array.from(lijst ?? []).filter((f) => f.type.startsWith("image/"));
  const geschikt = alle.filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));
  return { geschikt, ongeschikt: alle.length - geschikt.length };
}

function meldOngeschikt(aantal: number) {
  if (aantal > 0) toast.error(`Alleen afbeeldingen in ${SOORTEN} kunnen geplakt of gesleept worden.`);
}

/** Een data:-URI van een afbeelding als bestand, of null als het type niet ondersteund is. */
async function dataUriNaarBestand(uri: string): Promise<File | null> {
  let type = uri.match(/^data:([^;,]+);base64,/)?.[1]?.toLowerCase();
  if (type === "image/jpg") type = "image/jpeg";
  if (!type || !ACCEPTED_IMAGE_TYPES.includes(type)) return null;
  const blob = await (await fetch(uri)).blob();
  return new File([blob], `geplakt.${type.split("/")[1].replace("jpeg", "jpg")}`, { type });
}

// De plek waar een afbeelding komt die nog geüpload wordt. De plugin houdt de
// positie zelf bij (en tekent daar een plaatshouder): een gemapte positie
// blijft altijd bestaan, ook als de tekst ernaast gewist of overtypt wordt.
// Zo komt de afbeelding waar ze geplakt of neergezet werd, ook als je intussen
// verder typt of ergens anders klikt.
type Plekken = Map<object, { pos: number; assoc: number }>;
type Actie = { voegToe?: { id: object; pos: number; assoc?: number }; haalWeg?: object };
type PluginState = { plekken: Plekken };

function plaatshouder() {
  const el = document.createElement("span");
  el.className = "afbeelding-upload";
  el.textContent = "Afbeelding wordt geüpload…";
  return el;
}

async function uploadVeilig(bestand: File, articleId: string): Promise<ActionResult<{ url: string }>> {
  try {
    return await uploadBestand(bestand, "afbeelding", articleId);
  } catch (error) {
    console.error("Upload mislukt:", error);
    return { success: false, error: "Uploaden is mislukt" };
  }
}

export const GeplakteAfbeeldingen = Extension.create<GeplakteAfbeeldingenOpties>({
  name: "geplakteAfbeeldingen",
  // Vóór de plak-afhandeling van andere extensies (Link heeft 1000).
  priority: 1001,

  addOptions() {
    return { articleId: "temp", zetBezig: () => {} };
  },

  addProseMirrorPlugins() {
    const o = this.options;
    const sleutel = new PluginKey<PluginState>("geplakteAfbeeldingen");
    // Base64-afbeeldingen die al geüpload zijn (data:-URI → URL). Komt zo'n
    // afbeelding later toch terug (bv. ongedaan maken en opnieuw doen), dan
    // wordt ze meteen weer vervangen.
    const geupload = new Map<string, string>();

    const plekVan = (state: EditorState, id: object) => sleutel.getState(state)?.plekken.get(id)?.pos ?? null;

    /** Vervangt bekende data:-URI's in het document door hun URL. */
    function vervangBekende(state: EditorState): Transaction | null {
      if (geupload.size === 0) return null;
      const tr = state.tr;
      state.doc.descendants((node, pos) => {
        const url = node.type.name === "image" ? geupload.get(node.attrs.src) : undefined;
        if (url) tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: url });
      });
      // Geen eigen stap in de geschiedenis: ongedaan maken haalt gewoon het plakken weg.
      return tr.docChanged ? tr.setMeta("addToHistory", false) : null;
    }

    async function uploadEnVoegIn(view: EditorView, bestanden: File[], pos: number | null) {
      // De plek nu vastleggen: plakken vervangt meteen de selectie, slepen
      // gebruikt de dichtstbijzijnde geldige plek bij de muis.
      const tr = view.state.tr;
      if (pos === null) {
        tr.deleteSelection();
        pos = tr.selection.from;
        // Aan het begin of einde van een alinea: meteen de plek tussen de blokken.
        if (tr.doc.resolve(pos).parent.content.size) {
          pos = insertPoint(tr.doc, pos, view.state.schema.nodes.image) ?? pos;
        }
      } else {
        const voorbeeld = view.state.schema.nodes.image.create({ src: "" });
        pos = dropPoint(tr.doc, pos, new Slice(Fragment.from(voorbeeld), 0, 0)) ?? pos;
      }
      const id = {};
      view.dispatch(tr.setMeta(sleutel, { voegToe: { id, pos } } satisfies Actie));
      o.zetBezig(true);
      try {
        for (const bestand of bestanden) {
          const resultaat = await uploadVeilig(bestand, o.articleId);
          if (view.isDestroyed) return;
          if (!resultaat.success || !resultaat.data) {
            toast.error(resultaat.error ?? "Afbeelding uploaden mislukt");
            continue;
          }
          const p = plekVan(view.state, id);
          if (p === null) {
            toast.error("De geplakte afbeelding kon niet ingevoegd worden.");
            return;
          }
          const node = view.state.schema.nodes.image.create({ src: resultaat.data.url });
          const invoeg = view.state.tr.replaceRangeWith(p, p, node);
          // replaceRangeWith kan de afbeelding achter de alinea zetten, of een
          // lege alinea vervangen. De plek schuift daarom naar direct achter
          // wat echt ingevoegd werd, zodat de volgende afbeelding erachter komt.
          let na = invoeg.mapping.map(p, 1);
          invoeg.mapping.maps.at(-1)?.forEach((_a, _b, _c, eind) => (na = eind));
          // Stond de cursor nog op de plakplek, dan komt hij achter de
          // afbeelding (zoals bij gewoon plakken), zodat verder typen of nog
          // eens plakken eronder komt en niet erboven.
          const sel = view.state.selection;
          const $s = sel.$from;
          const cursorBijPlek =
            sel.empty &&
            (sel.from === p ||
              ($s.parent.isTextblock && $s.parentOffset === $s.parent.content.size && $s.after() === p));
          if (cursorBijPlek) {
            const $na = invoeg.doc.resolve(na);
            if ($na.parent.inlineContent) {
              invoeg.setSelection(TextSelection.create(invoeg.doc, na));
            } else {
              if (!$na.nodeAfter?.isTextblock) invoeg.insert(na, view.state.schema.nodes.paragraph.create());
              invoeg.setSelection(TextSelection.create(invoeg.doc, na + 1));
            }
          }
          // assoc -1: de plek blijft direct achter de afbeelding, ook als er
          // daarna een lege alinea bijkomt (TrailingNode of hierboven).
          view.dispatch(
            invoeg.scrollIntoView().setMeta(sleutel, { voegToe: { id, pos: na, assoc: -1 } } satisfies Actie)
          );
        }
      } finally {
        o.zetBezig(false);
        if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(sleutel, { haalWeg: id } satisfies Actie));
      }
    }

    /** Uploadt net geplakte base64-afbeeldingen en vervangt ze door de URL. */
    async function vervangDataUris(view: EditorView, uris: string[]) {
      try {
        for (const uri of uris) {
          let resultaat: ActionResult<{ url: string }>;
          try {
            const bestand = await dataUriNaarBestand(uri);
            resultaat = bestand ? await uploadVeilig(bestand, o.articleId) : { success: false, error: `alleen ${SOORTEN}` };
          } catch (error) {
            console.error("Geplakte afbeelding lezen mislukt:", error);
            resultaat = { success: false };
          }
          if (view.isDestroyed) return;
          if (!resultaat.success || !resultaat.data) {
            toast.error(
              `Een geplakte afbeelding kon niet geüpload worden en staat nu in de tekst zelf${resultaat.error ? ` (${resultaat.error})` : ""}.`
            );
            continue;
          }
          geupload.set(uri, resultaat.data.url);
          const tr = vervangBekende(view.state);
          if (tr) view.dispatch(tr);
        }
      } finally {
        o.zetBezig(false);
      }
    }

    /**
     * Gewoon plakken of neerzetten laten gebeuren, en daarna de
     * base64-afbeeldingen uit die inhoud uploaden (bv. HTML uit een webpagina).
     */
    function vervangNaInvoegen(view: EditorView, slice: Slice): false {
      const uris = new Set<string>();
      slice.content.descendants((node) => {
        const src = node.attrs.src;
        if (node.type.name === "image" && typeof src === "string" && src.startsWith("data:") && !geupload.has(src)) {
          uris.add(src);
        }
      });
      if (uris.size > 0) {
        // Meteen als bezig melden, zodat opslaan wacht (het uploaden zelf start
        // pas na het invoegen).
        o.zetBezig(true);
        setTimeout(() => void vervangDataUris(view, [...uris]), 0);
      }
      return false;
    }

    return [
      new Plugin<PluginState>({
        key: sleutel,
        state: {
          init: () => ({ plekken: new Map() }),
          apply(tr, oud) {
            const actie = tr.getMeta(sleutel) as Actie | undefined;
            if (!tr.docChanged && !actie) return oud;
            const plekken: Plekken = new Map();
            for (const [id, plek] of oud.plekken) {
              plekken.set(id, { pos: tr.mapping.map(plek.pos, plek.assoc), assoc: plek.assoc });
            }
            if (actie?.haalWeg) plekken.delete(actie.haalWeg);
            if (actie?.voegToe) {
              plekken.set(actie.voegToe.id, { pos: actie.voegToe.pos, assoc: actie.voegToe.assoc ?? 1 });
            }
            return { plekken };
          },
        },

        appendTransaction(transactions, _oud, state) {
          return transactions.some((t) => t.docChanged) ? vervangBekende(state) : null;
        },

        props: {
          decorations(state) {
            const plekken = sleutel.getState(state)?.plekken;
            if (!plekken?.size) return null;
            return DecorationSet.create(
              state.doc,
              [...plekken].map(([id, plek]) => Decoration.widget(plek.pos, plaatshouder, { id }))
            );
          },

          // Een afbeelding uit het klembord (bv. een schermafbeelding): uploaden.
          // Zit er ook tekst bij (bv. een stuk uit Word), dan gewoon plakken.
          handlePaste(view, event, slice) {
            const { geschikt, ongeschikt } = afbeeldingen(event.clipboardData?.files);
            const tekst = event.clipboardData?.getData("text/plain").trim();
            if (geschikt.length === 0 || tekst) {
              if (!tekst) meldOngeschikt(ongeschikt);
              return vervangNaInvoegen(view, slice);
            }
            event.preventDefault();
            meldOngeschikt(ongeschikt);
            void uploadEnVoegIn(view, geschikt, null);
            return true;
          },

          // Afbeeldingsbestanden die in de editor gesleept worden: uploaden op
          // de plek waar ze neerkomen. Slepen binnen de editor blijft gewoon slepen.
          handleDrop(view, event, slice) {
            if (view.dragging) return false;
            const { geschikt, ongeschikt } = afbeeldingen(event.dataTransfer?.files);
            meldOngeschikt(ongeschikt);
            if (geschikt.length === 0) {
              if (ongeschikt > 0) {
                // Niet laten openvallen in de browser.
                event.preventDefault();
                return true;
              }
              return vervangNaInvoegen(view, slice);
            }
            event.preventDefault();
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
            void uploadEnVoegIn(view, geschikt, pos ?? view.state.selection.from);
            return true;
          },
        },
      }),
    ];
  },
});
