// What a line of the graph IS, said by its look (2026-10-17): the four kinds of link the Core records, never mixed.
//   documented — a canonical relation recorded from sources (not spatial): solid, blue, the thickest
//   role       — the role of an element in an event, other than where it happened: solid, violet
//   inferred   — membership of a connection found by a rule, or a relation a rule hypothesizes: dashed, sand
//   geo        — plain geography (where it is, where it happened, what is near): thin, grey — context, not a connection
// Same partition as the focus card (lib/connections.ts: spatial relations and GEO_ROLES are geographic context).
// Pure: unit-tested.

import { GEO_ROLES } from "../lib/connections.ts";

export type LinkClass = "documented" | "role" | "inferred" | "geo";

export const LINK_STYLE: Record<LinkClass, { color: string; size: number; dashed: boolean }> = {
  documented: { color: "#79A7C9", size: 1.6, dashed: false },
  role: { color: "#A592D6", size: 1.3, dashed: false },
  inferred: { color: "#C9B98A", size: 1.3, dashed: true },
  geo: { color: "#4A555C", size: 0.8, dashed: false },
};

/** The kind of a link from what the Core recorded: its edge kind, its type, and the nature of a relation (the edge's
 * own, else its type's from GET /types). Anything else (a drawn path, an unknown kind) has no kind: never "documented". */
export function linkClass(edgeKind: string, etype: string, nature?: string | null): LinkClass | null {
  if (edgeKind === "insight_member" || edgeKind === "hypothesis") return "inferred";
  if (edgeKind === "participation") return GEO_ROLES.has(etype) ? "geo" : "role";
  if (edgeKind === "relation") return nature === "spatial" ? "geo" : "documented";
  return null;
}

/** The kind of a row of the focus card's connections (rows are never geographic: those stay in their own list). */
export function rowClass(cat: "insight" | "relation" | "role"): LinkClass {
  return cat === "insight" ? "inferred" : cat === "relation" ? "documented" : "role";
}
