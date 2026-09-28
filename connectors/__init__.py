"""Connectors: pure modules that plan requests and parse raw payloads.

They never perform network I/O and never touch the database. This package is
the only place where names of real sources appear (besides configuration).
"""
