# Social feedback

Social feedback validates portraits returned by peers and combines them into the
image representing how the world currently perceives the Individual.

The prototype implements:

- subject, artist, cycle, and source-provenance validation;
- deterministic layer ordering and composite policies;
- deterministic visual layering and evidence normalization;
- handling for late, missing, duplicated, or incompatible portraits;
- composite artifact lineage and bounded publication;
- tests proving an Individual cannot receive another subject's feedback.

The composite is an authored social image, not an assertion of objective truth.

The compositor is not trusted to describe its own result. Core recomputes the
canonical weights, consensus, self comparison, disagreement ranges, confidence,
and geometry from the accepted source and peer portraits, then requires exact
semantic equality. The same verifier runs while loading persisted snapshots, so
a bounded but fabricated social claim is quarantined rather than trusted after a
restart.
