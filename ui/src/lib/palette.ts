// Visual encoding (decision D7). Nature → shape; family (from vocab display hints) → one muted hue chosen for its
// meaning in src/config/palette.json (2026-10-09: no longer by sorted position, which turned every family past the
// eighth into the same grey and would shift colours whenever the vocabulary grows). A type may refine its family's
// hue; a family not in the configuration is drawn in the neutral grey. No domain vocabulary in this code (W9).

import type { Kind, TypeInfo } from "./types";
import PALETTE from "../config/palette.json";

export const TOKENS = {
  bg: "#0D1012", panel: "#13171A", raised: "#1A1F23", line: "#262C31",
  text: "#D6DBDE", dim: "#8A949A", accent: "#E0A640", link: "#79A7C9",
};
export const OTHER = "#77858B";
export const INSIGHT = "#C9B98A";
export const SHAPE: Record<Kind, string> = { object: "■", event: "●", insight: "◆", relation: "—" };

const FAMILIES: Record<string, string> = PALETTE.families;
const TYPES: Record<string, string> = PALETTE.types;
let typeFamily = new Map<string, string>();

/** The family of each type (to colour an element known only by its type). */
export function setFamilies(types: TypeInfo[]) {
  typeFamily = new Map(types.map((t) => [t.id, t.family]));
}

/** The colour of an element: its type's own hue, else its family's, else the neutral grey; insights their own. */
export function colorOf(family: string | undefined, kind?: Kind, type?: string): string {
  if (kind === "insight") return INSIGHT;
  if (type && TYPES[type]) return TYPES[type];
  const f = family ?? (type ? typeFamily.get(type) : undefined);
  return (f && FAMILIES[f]) || OTHER;
}

export const bandOpacity = [0.45, 0.7, 1.0];
