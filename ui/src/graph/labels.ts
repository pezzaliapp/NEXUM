// GRAPH LABELS (Phase 3B · A1, 2026-10-03) — which node names are written, and where, so that no two names overlap.
// Pure geometry, recomputed for every frame by the graph view. Nodes and edges are never hidden: only labels are placed
// or left out (a node without a written name is still drawn, touchable, and named in the lists above the graph).
//   · priority: the focus first, then the selected/secondary and path nodes, then the focus's direct connections found
//     by NEXUM, then its other direct neighbours, then the rest; ties by node size, then id (stable from frame to frame);
//   · placement: right of the node, else left, else above, else below; a place is taken only if it stays inside the
//     drawing area, does not cover a name already written, a node's disc, or an interface element over the canvas;
//   · density: names of unrelated nodes (the rest) at most one per grid cell, as sigma's own label grid did.

export interface LabelCandidate {
  key: string;
  x: number; y: number;          // node centre, viewport px
  r: number;                     // node radius, viewport px
  w: number;                     // width of the text to write, px
  wShort?: number;               // width of a shorter form, tried when the full one fits nowhere
  priority: number;              // 0 focus · 1 secondary/path · 2 NEXUM connection of the focus · 3 neighbour · 4 rest
  size: number;                  // tie-breaker (bigger first)
}
export interface Rect { x1: number; y1: number; x2: number; y2: number }
export interface Placement { x: number; baseline: number; w: number; side: "right" | "left" | "above" | "below"; short?: boolean }
export interface PlanOptions {
  width: number; height: number;
  fontSize: number;              // px
  obstacles?: Rect[];            // interface elements over the canvas (viewport px)
  cell?: number;                 // density cell for priority ≥ 4 (px)
  margin?: number;               // inside the drawing area (px)
}

const PAD_X = 3, PAD_Y = 2;

/** A uniform grid of rectangles for fast overlap queries. */
class Grid {
  private cells = new Map<number, Rect[]>();
  private size: number;
  constructor(size: number) { this.size = size; }
  private keys(r: Rect, f: (k: number) => void) {
    const s = this.size;
    for (let gx = Math.floor(r.x1 / s); gx <= Math.floor(r.x2 / s); gx++)
      for (let gy = Math.floor(r.y1 / s); gy <= Math.floor(r.y2 / s); gy++) f(gx * 100003 + gy);
  }
  add(r: Rect) { this.keys(r, (k) => { const c = this.cells.get(k); if (c) c.push(r); else this.cells.set(k, [r]); }); }
  hits(r: Rect, skip?: Rect): boolean {
    let hit = false;
    this.keys(r, (k) => {
      if (hit) return;
      for (const o of this.cells.get(k) ?? []) {
        if (o === skip) continue;
        if (r.x1 < o.x2 && r.x2 > o.x1 && r.y1 < o.y2 && r.y2 > o.y1) { hit = true; return; }
      }
    });
    return hit;
  }
}

export function planLabels(cands: LabelCandidate[], o: PlanOptions): Map<string, Placement> {
  const m = o.margin ?? 4, fs = o.fontSize;
  const inside = (r: Rect) => r.x1 >= m && r.x2 <= o.width - m && r.y1 >= 0 && r.y2 <= o.height;
  const visible = cands.filter((c) => c.x + c.r >= 0 && c.x - c.r <= o.width && c.y + c.r >= 0 && c.y - c.r <= o.height);
  const ordered = [...visible].sort((a, b) => a.priority - b.priority || b.size - a.size || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const labels = new Grid(48), discs = new Grid(48), ui = new Grid(96);
  const discOf = new Map<string, Rect>();
  for (const c of visible) {
    const d = { x1: c.x - c.r, y1: c.y - c.r, x2: c.x + c.r, y2: c.y + c.r };
    discOf.set(c.key, d);
    discs.add(d);
  }
  for (const r of o.obstacles ?? []) ui.add(r);
  const usedCell = new Set<number>();
  const cell = o.cell ?? 90;
  const out = new Map<string, Placement>();
  for (const c of ordered) {
    const gap = c.r + 3;
    const boxOf = (x: number, b: number, w: number): Rect => ({ x1: x - PAD_X, y1: b - fs + 1 - PAD_Y, x2: x + w + PAD_X, y2: b + 3 + PAD_Y });
    let placed: Placement | null = null;
    // full name first, then its shorter form; the focus is always named (last resort: a place touching another disc)
    const widths: [number, boolean][] = [[c.w, false]];
    if (c.wShort && c.wShort < c.w) widths.push([c.wShort, true]);
    search: for (const strict of c.priority === 0 ? [true, false] : [true]) {
      for (const [w, short] of widths) {
        const spots: [Placement["side"], number, number][] = [
          ["right", c.x + gap, c.y + fs / 3],
          ["left", c.x - gap - w, c.y + fs / 3],
          ["above", c.x - w / 2, c.y - gap - 2],
          ["below", c.x - w / 2, c.y + gap + fs],
        ];
        for (const [side, x, b] of spots) {
          const box = boxOf(x, b, w);
          if (!inside(box) || labels.hits(box) || ui.hits(box)) continue;
          if (strict && discs.hits(box, discOf.get(c.key))) continue;
          placed = { x, baseline: b, w, side, ...(short ? { short: true } : {}) };
          break search;
        }
      }
    }
    if (!placed) continue;
    if (c.priority >= 4) {
      const k = Math.floor(c.x / cell) * 100003 + Math.floor(c.y / cell);
      if (usedCell.has(k)) continue;
      usedCell.add(k);
    }
    labels.add(boxOf(placed.x, placed.baseline, placed.w));
    out.set(c.key, placed);
  }
  return out;
}

/** The boxes of a plan, as the responsive test reads them: [x1, x2, centre y]. */
export function planBoxes(plan: Map<string, Placement>, fontSize: number): [number, number, number][] {
  return [...plan.values()].map((p) => [p.x, p.x + p.w, p.baseline - fontSize / 3]);
}
