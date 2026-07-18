# Visual output requirements

The canvas is the public body of an Individual. Its physical characteristics are
part of the work and should be evaluated as an artistic surface, not merely as a
display specification.

Initial requirements:

- **VIS-001:** Each Individual must have a dedicated, continuously addressable
  canvas.
- **VIS-002:** The canvas must present the complete artwork without operating-system
  chrome, notifications, or visible cursor state.
- **VIS-003:** Brightness, contrast, viewing angle, resolution, and refresh behavior
  must remain legible under documented gallery conditions.
- **VIS-004:** The output path must recover automatically after signal loss or
  restart.
- **VIS-005:** Color and geometry must be calibratable while preserving intentional
  differences authored by an Individual.
- **VIS-006:** Unintended light emission, bezels, reflections, and status LEDs must
  be reviewed as parts of the installation.

See `canvas-display/` for the physical surface and `calibration/` for measurement
and consistency.

