"""NEXUM local query service (Phase 2).

A thin adapter between the Core and the workspace UI: it exposes Core
operations over HTTP, enforces budgets, deadlines and cancellation, and
serves the static UI. It contains no domain logic and never writes the world.
"""

API_VERSION = "v1"
