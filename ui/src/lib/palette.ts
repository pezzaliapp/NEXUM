// Visual encoding (decision D7). Nature → shape; family (from vocab display hints) → one of a few muted hues,
// assigned by sorted family name so that no domain vocabulary is written in the UI code (W9).

import type { Kind, TypeInfo } from "./types";

export const TOKENS = {
  bg: "#0D1012", panel: "#13171A", raised: "#1A1F23", line: "#262C31",
  text: "#D6DBDE", dim: "#8A949A", accent: "#E0A640", link: "#79A7C9",
};
export const FAMILY_HUES = ["#6E8797", "#86A07A", "#C08064", "#9785B3", "#B39B5E", "#6FA3A0"];
export const OTHER = "#77858B";
export const INSIGHT = "#C9B98A";
export const SHAPE: Record<Kind, string> = { object: "■", event: "●", insight: "◆", relation: "—" };

let familyColor = new Map<string, string>();

export function setFamilies(types: TypeInfo[]) {
  const fams = [...new Set(types.map((t) => t.family).filter(Boolean))].sort();
  familyColor = new Map(fams.map((f, i) => [f, i < FAMILY_HUES.length ? FAMILY_HUES[i] : OTHER]));
}

export function colorOf(family: string | undefined, kind?: Kind): string {
  if (kind === "insight") return INSIGHT;
  return (family && familyColor.get(family)) || OTHER;
}

export const bandOpacity = [0.45, 0.7, 1.0];
