import { describe, expect, it } from "vitest";

import {
  MAX_PUBLIC_SVG_DEPTH,
  MAX_PUBLIC_SVG_ELEMENTS,
  validatePublicSvg,
} from "../publicSvg";

const root = 'xmlns="http://www.w3.org/2000/svg"';

describe("shared public SVG policy", () => {
  it("accepts the deliberately small inert portrait dialect", () => {
    const svg = `<svg ${root} viewBox="0 0 100 120" role="img" aria-label="Study: portrait">
      <g transform="translate(2 3) scale(0.9)" fill="none" stroke="#ffffff">
        <path d="M 1 2 Q 4 5 8 9 Z" stroke-width="2"/>
        <text x="4" y="110" fill="#ffffff" font-family="sans-serif" font-size="8">Iris &amp; peers</text>
      </g>
    </svg>`;
    expect(validatePublicSvg(svg)).toBe(svg);
  });

  it("rejects raw and entity-encoded active-content attempts", () => {
    expect(() => validatePublicSvg(
      `<svg ${root} onload="alert(1)"></svg>`,
    )).toThrow(/unsafe|allowlisted/);
    expect(() => validatePublicSvg(
      `<svg ${root}><rect width="10" height="10" fill="&#x75;rl(https://attacker.example/x)"/></svg>`,
    )).toThrow(/inert color/);
    expect(() => validatePublicSvg(
      `<svg ${root}><rect width="10" height="10" fill="&#x6a;avascript:alert(1)"/></svg>`,
    )).toThrow(/inert color/);
    expect(() => validatePublicSvg(
      `<svg ${root}><script>encoded names are unnecessary</script></svg>`,
    )).toThrow(/allowlisted/);
  });

  it("rejects malformed nesting and trailing document markup", () => {
    expect(() => validatePublicSvg(`<svg ${root}><g></svg></g>`)).toThrow(/nesting|complete/);
    expect(() => validatePublicSvg(`<svg ${root}></svg><svg ${root}></svg>`)).toThrow(/outside|complete/);
  });

  it("bounds DOM complexity, nesting, and numeric rendering values", () => {
    const tooMany = `<svg ${root}>${"<g/>".repeat(MAX_PUBLIC_SVG_ELEMENTS + 1)}</svg>`;
    expect(() => validatePublicSvg(tooMany)).toThrow(/elements/);
    const tooDeep = `<svg ${root}>${"<g>".repeat(MAX_PUBLIC_SVG_DEPTH)}${"</g>".repeat(MAX_PUBLIC_SVG_DEPTH)}</svg>`;
    expect(() => validatePublicSvg(tooDeep)).toThrow(/nesting depth/);
    expect(() => validatePublicSvg(
      `<svg ${root}><rect width="1e999" height="10"/></svg>`,
    )).toThrow(/out-of-range/);
    expect(() => validatePublicSvg(
      `<svg ${root}><g transform="scale(1000000)"></g></svg>`,
    )).toThrow(/out-of-range/);
  });
});
