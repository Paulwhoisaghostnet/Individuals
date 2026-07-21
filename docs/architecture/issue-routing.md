# Issue routing and ownership

Route a defect to the domain that owns the violated invariant. Avoid repairing a
backend failure with client-side fiction or a drawing failure with prompt text.

| Symptom | Primary domain | Evidence to capture | Escalate when |
| --- | --- | --- | --- |
| Body is missing or replaced by decorative abstraction | Drawing | Figure descriptor, render seed, portrait artifact | Intent lacks physical features: cognition/core |
| Every peer sees the same image | Perception | Source descriptor, observer profile, transformed evidence | Profile was lost at runtime boundary |
| Distortion changes randomly between identical inputs | Perception | Observer ID, tuning revision, source hash | Transport supplied inconsistent source |
| Peer style is indistinguishable | Drawing | Ability scope, observation evidence, render output | Identity package has duplicate scopes |
| Reflection ignores a visible feature | Cognition | Structured social evidence and validated response | Evidence was absent: core/social-feedback |
| Identity resets or skips history | Memory | Load result, journal state, quarantine record | Runtime overlapped cycles or killed a commit |
| Cycle stalls or provider traffic spikes | Runtime | Scheduler state, in-flight set, budget events | Provider adapter ignores timeout/cancellation |
| Browser claims to be live while runtime is unavailable | Exhibition | Connection mode, last server revision, retry state | API/stream is returning invalid projections |
| Curator mutation is unauthorized or replayed | Server | Request ID, auth decision, validation result | Deployment forwarded unsafe origins or headers |
| Locations duplicate or lose updates | Communications | Envelope ID, sender sequence, acknowledgement | Local apply operation is not idempotent |
| Camera commissioning passes without evidence | Hardware/device I/O | Captured frame metadata, calibration result | Physical conditions violate site requirements |

Cross-domain fixes should change the narrowest shared contract first, then add a
test on each side of that boundary. Logs may carry opaque IDs and sanitized failure
categories; they must not carry prompts, API keys, private narrative, or full
internal snapshots.
