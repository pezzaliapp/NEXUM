// THE ONE SEA ROUTE ON THE MAP (2026-10-07, stabilization): a computed route is the only maritime geometry NEXUM draws
// from the SeaRoute model — one line, its own source, its own layer, its own tap handler — and nothing else is touched:
// no other layer's visibility, opacity, filter, legend or interaction. Closed, it leaves nothing behind (source, layer,
// handlers all removed): routeState() is "none" again.
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from "maplibre-gl";

const ID = "ops-searoute";
let active: { map: MLMap; tap: (e: MapLayerMouseEvent) => void; over: () => void; out: () => void } | null = null;

export const routeState = (): "active" | "none" => (active ? "active" : "none");

/** Draws the route (replacing any previous one); a tap on it calls onTap. */
export function showRoute(map: MLMap, line: number[][], onTap: () => void) {
  clearRoute();
  map.addSource(ID, { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } } });
  map.addLayer({ id: ID, type: "line", source: ID, layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#E0A640", "line-width": ["interpolate", ["linear"], ["zoom"], 1, 3, 8, 5.5], "line-opacity": 0.95 } });
  const tap = (e: MapLayerMouseEvent) => { e.preventDefault(); onTap(); };
  const over = () => { map.getCanvas().style.cursor = "pointer"; }, out = () => { map.getCanvas().style.cursor = ""; };
  map.on("click", ID, tap); map.on("mouseenter", ID, over); map.on("mouseleave", ID, out);
  active = { map, tap, over, out };
}

/** Removes the route and everything it brought; a no-op when there is none. */
export function clearRoute() {
  if (!active) return;
  const { map, tap, over, out } = active;
  active = null;
  map.off("click", ID, tap); map.off("mouseenter", ID, over); map.off("mouseleave", ID, out);
  if (map.getLayer(ID)) map.removeLayer(ID);
  if (map.getSource(ID)) map.removeSource(ID);
  map.getCanvas().style.cursor = "";
}

/** The route's own source, for a caller that only needs to know it is there (tests, the panel). */
export const routeSource = (map: MLMap) => map.getSource(ID) as GeoJSONSource | undefined;
