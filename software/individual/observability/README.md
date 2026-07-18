# Observability

Observability reports whether an Individual can continue participating without
turning private identity content into operational telemetry.

This branch will contain:

- structured lifecycle, error, latency, and resource events;
- health signals for models, memory, cameras, canvas output, and peers;
- cycle and artifact correlation identifiers;
- local diagnostics that remain available during internet failure;
- retention, sampling, redaction, and access-control policy;
- alert mappings from failure to Individual and capability.

Prompts, private narratives, memories, camera frames, and portrait content should
not enter logs by default.
