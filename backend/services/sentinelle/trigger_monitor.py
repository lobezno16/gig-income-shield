from __future__ import annotations

from services.sentinelle.trigger_cron import MultiOracleTriggerEngine

# Backward-compatible export used by main.py and existing imports.
TriggerMonitor = MultiOracleTriggerEngine
trigger_monitor = MultiOracleTriggerEngine()

