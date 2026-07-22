# Retained portrait timeline export

The timeline exporter creates a standalone curatorial view from the bounded
history already retained in the latest durable Individual snapshots. It is not a
complete lifetime archive: the current persistence contract retains at most eight
historical self-portraits, the current self-portrait, the latest social composite,
and that composite's persisted peer-drawing cohort.

The implementation is kept inside the checked `software/individual/timeline/`
domain. The CLI is only an argument and reporting adapter around the validated
loader, renderer, and atomic exporter.

## Run it

From the repository root:

```sh
npm run export:timeline
```

The input directory resolves in this order:

1. `--data-dir <path>`;
2. `INDIVIDUALS_DATA_DIR`;
3. `.data/individuals`.

The default output is `<resolved-data-dir>/exports/timeline.html`, which works
inside the same mounted production volume while remaining outside snapshots,
memories, journals, and quarantine state. A custom `--output <path.html>` is
written atomically as mode `0600`; paths inside protected identity-state
subdirectories are rejected.

Use `npm run export:timeline -- --help` for selection and view-bound options. The
package command invokes the checked CLI directly and is also available inside the
production runtime image.

## Security and privacy properties

- Snapshot and optional memory files are size-bounded, parsed as untrusted JSON,
  and passed through the same complete persistence validators used by the runtime.
- Every snapshot must match the exact currently installed manifest from the
  runtime identity registry; a valid but differently authored identity requires
  an explicit migration and cannot be exported as the installed Individual.
- Quarantined identities are refused. Invalid JSON, incompatible state,
  unsupported artwork formats, unsafe SVG, and partial validation failures abort
  the entire export before the previous output is replaced.
- Opted-in private-memory loading uses the runtime memory boundary, including its
  bounded legacy-quarantine scan. If active memory is absent while pre-marker
  quarantine evidence remains, export materializes the durable block and fails
  closed instead of presenting an empty history.
- HTTP portrait serving and timeline export share
  [`../security/publicSvg.ts`](../security/publicSvg.ts). Its structural allowlist
  bounds bytes, elements, attributes, nesting, paths, transforms, numeric values,
  and all executable or externally referenced surfaces.
- Validated SVG is base64-encoded into `data:image/svg+xml` image URLs. It is never
  inserted as live document markup.
- HTML serialization accepts only an opaque, deeply frozen render document created
  by the complete scalar-validation boundary. Type assertions or direct JavaScript
  calls cannot forge that runtime brand, and private-memory groups are rejected
  unless the document's warning mode is enabled.
- The HTML has no script, form, remote font, stylesheet, media, frame, or network
  dependency. An early CSP meta policy permits only its hashed inline stylesheet
  and embedded image data.
- Text fields are HTML-escaped. Portraits have concise accessible alternatives,
  the layout is responsive and printable, and the retained-history limitation is
  stated in the document itself.
- Persistence validator details remain available only as internal error causes.
  CLI/operator messages remove terminal and bidirectional controls, collapse line
  breaks, and stop at a fixed 320-character bound.

Private memory is excluded by default, and memory files are not even opened in
that mode. Including it requires the exact acknowledgement phrase printed by
`--help`:

```text
I_UNDERSTAND_PRIVATE_MEMORY_WILL_BE_WRITTEN_TO_A_PORTABLE_HTML_FILE
```

When that acknowledgement is supplied, the document displays a prominent warning
and includes only a bounded set of validated memories associated with visible
self-portrait cycles. The resulting file has crossed the normal public/private
projection boundary. Treat it as sensitive, review it manually, and do not upload
or share it by default.
