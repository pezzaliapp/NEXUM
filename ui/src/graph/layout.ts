// Deterministic graph layout (D3). A LayoutStrategy is a pure function: the same context always produces the same
// positions, and positions already on screen never move. A future explicit "Explore layout" is just another strategy.

export interface LNode { id: string; parent: string | null; group: string }
export type Positions = Map<string, { x: number; y: number }>;
export interface LayoutStrategy { name: string; place(nodes: LNode[], prev: Positions, focus: string): Positions }

const TAU = Math.PI * 2;
const byId = (a: LNode, b: LNode) => (a.group < b.group ? -1 : a.group > b.group ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Focus at the centre; its neighbours on rings, one angular sector per relation group; nodes discovered from
 * another node fan out on an arc beyond it, in the direction away from the centre. */
export const radialSectors: LayoutStrategy = {
  name: "radial-sectors",
  place(nodes, prev, focus) {
    const pos: Positions = new Map(prev);
    if (!pos.has(focus)) pos.set(focus, { x: 0, y: 0 });
    const children = new Map<string, LNode[]>();
    for (const n of nodes) {
      if (n.id === focus || pos.has(n.id)) continue;
      const p = n.parent && (pos.has(n.parent) || nodes.some((m) => m.id === n.parent)) ? n.parent : focus;
      if (!children.has(p)) children.set(p, []);
      children.get(p)!.push(n);
    }
    // breadth-first so that parents are placed before their children
    const queue = [focus, ...[...pos.keys()].filter((k) => k !== focus)];
    const seen = new Set<string>();
    while (queue.length) {
      const pid = queue.shift()!;
      if (seen.has(pid)) continue;
      seen.add(pid);
      const kids = (children.get(pid) ?? []).sort(byId);
      if (!kids.length) continue;
      const P = pos.get(pid)!;
      if (pid === focus && P.x === 0 && P.y === 0) {
        const groups = [...new Set(kids.map((k) => k.group))];
        const raw = groups.map((g) => Math.max(0.35, TAU * kids.filter((k) => k.group === g).length / kids.length));
        const norm = TAU / raw.reduce((x, y) => x + y, 0);
        let a0 = -Math.PI / 2;
        groups.forEach((g, gi) => {
          const inG = kids.filter((k) => k.group === g);
          const span = raw[gi] * norm;
          const perRing = Math.max(6, Math.floor(span * 14));
          inG.forEach((k, i) => {
            const ring = Math.floor(i / perRing), j = i % perRing;
            const n = Math.min(perRing, inG.length - ring * perRing);
            const a = a0 + span * (j + 0.5) / n;
            const r = 1 + ring * 0.32;
            pos.set(k.id, { x: r * Math.cos(a), y: r * Math.sin(a) });
          });
          a0 += span;
        });
      } else {
        const dist = Math.hypot(P.x, P.y);
        const theta = dist > 1e-9 ? Math.atan2(P.y, P.x) : -Math.PI / 2;
        const n = kids.length;
        const perRing = 24;
        kids.forEach((k, i) => {
          const ring = Math.floor(i / perRing), j = i % perRing, m = Math.min(perRing, n - ring * perRing);
          const spread = Math.min(Math.PI * 0.95, 0.3 + 0.1 * m);
          const a = theta - spread / 2 + spread * (j + 0.5) / m;
          const d = 0.42 + ring * 0.2;
          pos.set(k.id, { x: P.x + d * Math.cos(a), y: P.y + d * Math.sin(a) });
        });
      }
      for (const k of kids) queue.push(k.id);
    }
    return pos;
  },
};
