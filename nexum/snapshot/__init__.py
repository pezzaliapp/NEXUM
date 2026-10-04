"""Static snapshot of a NEXUM world (Phase 3, architecture B).

The SQLite world stays the authoritative build engine. This package runs the real Core, through the
same route handlers as the local service (nexum.api), and writes web artifacts that a browser loads
progressively from a static host:

- exact service responses for every element-centred request of the workspace (context, WHY,
  provenance, evidence, timelines, locate) and for the global documents (status, types, sources);
- compact, ordered row sets (aggregates, map rows, graph adjacency, references) from which the
  browser read model recomputes the scope-dependent operations (map, timeline, facets, insights,
  graph, search) — verified against the Core by the parity suite (nexum.snapshot.parity);
- the Core's full-text index, queried in the browser by the same SQLite engine (sqlite-wasm).

Nothing here writes the world database.
"""

FORMAT = 1
