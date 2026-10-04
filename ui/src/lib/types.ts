// Shared contract types (subset of the Core envelope and DTOs used by the workspace).

export type Kind = "object" | "event" | "relation" | "insight";
export const KINDS: readonly Kind[] = ["object", "event", "relation", "insight"];

export interface Ref {
  kind: Kind;
  id: string;
  type: string;
  label: string;
}

export interface Envelope<T = any> {
  data: T;
  lod: "counts" | "aggregates" | "refs" | "details";
  total: number | null;
  returned: number | null;
  truncated: boolean;
  cursor_next: string | null;
  excluded: Record<string, number>;
  highlight: { ref: string; appears_as: string; [k: string]: any }[] | null;
  sources: { source_id: string; attribution: string; license_id: string }[];
  world_version: number;
  timing_ms: number;
  bytes: number;
  api?: { op: string; elapsed_ms: number; budget_applied: Record<string, any>; cache: string };
}

export interface Scope {
  types?: string[] | null;
  time_window?: [number, number] | null;
  min_confidence?: number;
  sources?: string[] | null;
  text?: string | null;
}

export interface TypeInfo {
  id: string;
  label: string;
  kind: Kind;
  family: string;
  density_priority: number;
  count: number;
  geometry?: string;
  nature?: string;
  /** presentation hints of the vocabulary: filter category, headline facts, facts shown in the card */
  group?: string;
  headline?: { property: string; prefix?: string; suffix?: string; digits?: number }[];
  facts?: { property: string; label: string; unit?: string; digits?: number; values?: Record<string, string> }[];
  /** the categories a type's elements are counted by (e.g. kinds of facility), with readable value names */
  subtypes?: { property: string; note?: string; values?: Record<string, string> };
  /** an image the source keeps current (vocabulary hint): which property holds its URL and how it is described */
  media?: { property: string; kind: "current_image" | "live_video" | "static_reference"; refresh_property?: string;
    credit_property?: string; observed_property?: string; state_property?: string };
  /** false: information about other elements, never a map layer nor a filter (vocabulary hint "map") */
  map?: boolean;
  /** measured values carried by the type (vocabulary hints "series" / "wave") */
  series?: { property: string; kind: string };
  wave?: { property: string };
  /** one indicator for every place (World Intelligence) / a digest of source events (not a map layer) */
  indicator?: { property: string };
  digest?: boolean;
  /** cameras near this kind of place are listed in its view (km) */
  nearby_media_km?: number;
  /** an office type: the relations naming its holders and where it has competence (vocabulary hint "tenure") */
  tenure?: { held_by: string; scope: string; role_property?: string };
  /** a rate table (vocabulary hint "rates") and the elements priced by one (hint "rated") */
  rates?: { property: string; dims: string; dim_labels: string; components: string; unit: string; validity?: string; rounding?: string; legal?: string };
  rated?: { via: string; segments: string; length: string };
  /** an explorable element type (vocabulary hint "explore"): its own view, first in search, opened from the map's names */
  explore?: { label: string; one: string; many?: string; hint: string; placeholder?: string };
}

export interface WorldStatus {
  world_id: string;
  counts: Record<string, number>;
  by_type: Record<string, number>;
  geometry: { with_geometry: number; without_geometry: number };
  has_geometry: boolean;
  time_extent: [number, number] | null;
  sources: { source_id: string; name: string; attribution: string; license_id: string; health: string;
    last_success_ms: number | null; entities: number }[];
  basemap: Record<string, any>;
  limits: { map_features: number; store_refs: number; graph_nodes: number; graph_edges: number };
}
