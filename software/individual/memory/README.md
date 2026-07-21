# Memory

Memory preserves identity continuity beyond a single model context or process
lifetime.

The prototype implements:

- atomic Individual snapshot persistence;
- append-only cycle and portrait provenance records;
- bounded episodic and reflective memory records;
- bounded recall and archive retention;
- schema validation, transaction recovery, quarantine, and integrity checks;
- retention and redaction policies for private identity content.

## Disk budgets

File-backed memory applies byte ceilings as well as record counts. Defaults are
deliberately conservative for a continuously running installation:

- current memory: 512 entries and 2 MiB per Individual;
- current-memory backup: one file and 2 MiB per Individual;
- rotated memory archives: eight files and 16 MiB total per Individual;
- memory corruption evidence: 32 files and 32 MiB total per installation;
- one transaction journal: 3 MiB;
- active transaction journals: 64 files and 64 MiB total per installation;
- abandoned journals: 20 files and 32 MiB total;
- quarantined journals: 20 files and 32 MiB total.

The current 17-Individual society limit therefore gives current memory, its
backup, and archives a maximum steady-state footprint of roughly 340 MiB. Journal
and quarantine ceilings are installation-wide. Snapshots, tuning, portrait
artifacts, and telemetry have their own policies and are not charged to this
allowance.

Writers calculate exact UTF-8 payload size before publication. They rotate only
archives, backups, and auxiliary forensic residue to make room; they never delete
active memory, a snapshot, or a committing journal to satisfy a quota. An active
journal set over its aggregate allowance blocks recovery for operator review. A
new write that cannot fit fails with `PERSISTENCE_QUOTA_EXCEEDED` before replacing
durable identity state.

Archive and auxiliary-quarantine maintenance runs during recall/write and startup,
bringing oversized residue from older releases back within count and byte limits.
Cleanup is restricted to managed filename classes and never follows symlinks or
treats unrelated files as disposable.

Model context is temporary working material. It is not a substitute for durable,
explicitly governed memory.

Site backup and restore remain operational responsibilities. Corrupt state is
quarantined and surfaced; it is never silently replaced with a fresh identity.

## Quarantine is a durable identity block

Snapshot quarantine creates two records under `snapshots/.quarantine/`: the
renamed evidence file and a stable `<individual-id>.blocked.json` marker. The
marker is published before the invalid snapshot is moved. Its existence blocks
loads and ordinary saves across repository instances and process restarts, even
though the original snapshot path is now absent. Marker contents contain only a
schema version, safe Individual ID, timestamp, and fixed reason code—never raw
state, exception text, or provider data.

Repositories created before stable markers existed are also fail-closed. If an
active snapshot and marker are both absent but a matching
`<individual-id>.json.*.corrupt` artifact remains, the repository durably
materializes a `legacy_quarantine_artifact` marker instead of treating the
identity as new.

Do not delete a marker to make an installation boot. Recovery is an explicit
administrative migration: construct a reviewed, fully validated snapshot for the
currently installed manifest and call
`FileIndividualRepository.replaceQuarantinedSnapshot`. The repository verifies
snapshot ownership and exact manifest compatibility, durably publishes the
replacement, and only then removes the marker. If publication or marker removal
is interrupted, the identity remains blocked and the operation can be retried.
`FileIndividualRepository.recoverFromBackup` crosses the same replacement
boundary: callers must supply the currently installed manifest, and the backup
must match it exactly. The quarantined evidence artifact remains available for
offline diagnosis.

Active-memory corruption follows the same fail-closed rule under
`memories/.quarantine/`. A missing active memory file is not interpreted as an
empty history when a marker or pre-marker corruption artifact exists. Recall and
ordinary writes remain blocked until a curator calls
`FileMemoryStore.replaceQuarantinedMemories` with a reviewed, validated, bounded
set belonging only to that Individual. This prevents corruption from becoming
silent amnesia. The replacement is durable before the marker is removed.

Production uses `JournaledCyclePersistence`, which exposes the same explicit
operations as `replaceQuarantinedSnapshot`, `recoverSnapshotFromBackup`, and
`replaceQuarantinedMemories`; it does not expose any general-purpose marker
deletion shortcut.

Block markers are never automatically pruned. Older memory and transaction
forensic files may rotate under the explicit quotas above; export them before
administrative recovery if an investigation needs longer retention.
