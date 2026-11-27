# Siddha — standalone

This package is self-contained. If another AYUSH app already hosts the shared services on the ports in `.env` (platform 5101, clinical 5107, longitudinal 5108, integrations 5109, bus 5110, AI 5111), startup detects the occupied port and reuses them; both apps must then share the same `DATA_ROOT` and `AYUSH_SECRET`. Otherwise this package starts them itself. See README.md.
