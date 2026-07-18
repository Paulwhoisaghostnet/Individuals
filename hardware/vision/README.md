# Vision requirements

Vision hardware provides the embodied eyes through which an Individual observes
peer canvases. A digital build may replace cameras with direct canvas views, but
the same perception boundary and image metadata should be preserved.

Initial requirements:

- **CAM-001:** Every camera must be aimed only at an assigned peer canvas.
- **CAM-002:** The field of view must exclude visitors and unrelated gallery areas
  wherever physically possible.
- **CAM-003:** Resolution, exposure, frame rate, and dynamic range must preserve the
  visual information required by the associated perception system.
- **CAM-004:** Camera identity and peer-to-subject routing must remain stable across
  restart and reconnection.
- **CAM-005:** The capture path must expose enough control for intentional visual
  distortion without relying on accidental driver behavior.
- **CAM-006:** Camera mounts and focus must resist drift during exhibition operation.

See `cameras/`, `optics/`, and `calibration/` for component-level work.

