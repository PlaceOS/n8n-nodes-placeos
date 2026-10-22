# Changelog

## 0.1.0 (2026-10-22)

First release.

- PlaceOS API credential (API key), tested against the key inspection route.
- PlaceOS node: System, Module, Zone, Metadata, User and Signal resources on the REST API; Booking, Guest, Desk and
  Space resources on the Staff API. Usable as an AI Agent tool.
- PlaceOS Trigger: runs a workflow when module status values change, over the PlaceOS control websocket, with
  keepalive and reconnect.
- Example workflows for an occupancy alert, a daily desk booking summary and an AI assistant.
