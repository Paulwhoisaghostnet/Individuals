import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { individuals } from "../data";
import { PortraitCanvas } from "../PortraitCanvas";

describe("procedural portrait DOM identity", () => {
  it("assigns distinct SVG resource IDs to repeated renderings of the same portrait", () => {
    const markup = renderToStaticMarkup(
      <>
        <PortraitCanvas individual={individuals[0]} cycle={7} />
        <PortraitCanvas individual={individuals[0]} cycle={7} />
      </>,
    );
    const filterIds = [...markup.matchAll(/<filter id="(distortion-[^"]+)"/g)].map(
      (match) => match[1],
    );
    const grainIds = [...markup.matchAll(/<radialGradient id="(grain-[^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(filterIds).toHaveLength(2);
    expect(grainIds).toHaveLength(2);
    expect(new Set(filterIds).size).toBe(2);
    expect(new Set(grainIds).size).toBe(2);
    expect(markup).toContain(`url(#${filterIds[0]})`);
    expect(markup).toContain(`url(#${filterIds[1]})`);
  });

  it("renders each authored artistic vocabulary while preserving a recognizable body", () => {
    const markup = renderToStaticMarkup(
      <>
        {individuals.map((individual) => (
          <PortraitCanvas individual={individual} cycle={7} key={individual.id} />
        ))}
      </>,
    );

    expect(markup).toContain('data-mark-language="contour"');
    expect(markup).toContain('data-mark-language="fragment"');
    expect(markup).toContain('data-mark-language="thread"');
    expect(markup).toContain('data-practice-effect="assembled-planes"');
    expect(markup.match(/data-anatomy="head"/g)?.length).toBeGreaterThanOrEqual(individuals.length);
    expect(markup.match(/data-anatomy="limbs"/g)?.length).toBeGreaterThanOrEqual(individuals.length);
  });
});
