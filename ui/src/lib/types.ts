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
