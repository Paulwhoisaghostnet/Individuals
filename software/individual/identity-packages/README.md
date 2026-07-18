# Identity packages

An identity package is the version-controlled authored self of one Individual. It
selects and configures capabilities but does not contain live memories, credentials,
device identifiers, or mutable deployment state.

Each named package should contain:

```text
individual-name/
├── README.md          # Artistic intent and authored limitations
├── manifest.ts        # Validated IndividualManifest
├── prompts/           # Cognition instructions and structured-output examples
├── perception/        # Parameters, masks, shaders, and transformation policy
├── drawing/           # Palette, marks, composition rules, and renderer policy
├── assets/            # Versioned identity-owned visual reference material
└── tests/             # Identity-specific invariants and recognizable behaviors
```

The `template/` package is the starting point for future Individuals. Copy it to a
new, stable ID; replace its authored material; add identity-specific tests; and
review the resulting manifest and assets as one change.

Do not let two deployed Individuals point to the same mutable identity-state or
memory namespace, even when their packages share code or ancestry.
