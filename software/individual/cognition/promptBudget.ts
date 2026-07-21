export const MAX_COGNITION_PROMPT_BYTES = 64_000;

export const BOUNDED_CONTEXT_TERMINATOR = "END OF BOUNDED CONTEXT.";

export interface BoundedPromptSection {
  readonly label: string;
  /** Ordered from richest to smallest. Every variant is emitted as complete JSON. */
  readonly variants: readonly unknown[];
}

export interface BoundedPromptDefinition {
  readonly preamble: string;
  readonly sections: readonly BoundedPromptSection[];
  readonly terminator?: string;
  readonly maximumBytes?: number;
}

const encoder = new TextEncoder();

const byteLength = (value: string): number => encoder.encode(value).byteLength;

const serializeVariant = (value: unknown, label: string): string => {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) {
    throw new Error(`Prompt section "${label}" cannot serialize an undefined value.`);
  }
  return serialized;
};

const assertBoundary = (value: string, name: string): void => {
  if (value.trim().length === 0 || /[\r\n]/.test(value)) {
    throw new Error(`${name} must be a non-empty, single-line boundary.`);
  }
};

/**
 * Composes a byte-bounded prompt without ever truncating serialized data.
 *
 * The smallest variant of every section is installed first, which makes the
 * section labels and closing delimiter invariant. Sections are then upgraded
 * in declaration order, so callers express preservation priority explicitly.
 */
export const composeBoundedPrompt = ({
  preamble,
  sections,
  terminator = BOUNDED_CONTEXT_TERMINATOR,
  maximumBytes = MAX_COGNITION_PROMPT_BYTES,
}: BoundedPromptDefinition): string => {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new Error("Prompt byte budget must be a positive safe integer.");
  }
  if (preamble.trim().length === 0) throw new Error("Prompt preamble cannot be empty.");
  assertBoundary(terminator, "Prompt terminator");

  const serializedSections = sections.map((section) => {
    assertBoundary(section.label, "Prompt section label");
    if (section.variants.length === 0) {
      throw new Error(`Prompt section "${section.label}" requires at least one variant.`);
    }
    return {
      label: section.label,
      variants: section.variants.map((variant) => serializeVariant(variant, section.label)),
    };
  });

  const selected = serializedSections.map((section) => section.variants.length - 1);
  const render = (): string =>
    `${preamble.trimEnd()}\n\n${serializedSections
      .map((section, index) => `${section.label}\n${section.variants[selected[index]!]!}`)
      .join("\n\n")}\n\n${terminator}`;

  let prompt = render();
  if (byteLength(prompt) > maximumBytes) {
    throw new Error("Prompt's mandatory boundaries and minimum context exceed its byte budget.");
  }

  for (let sectionIndex = 0; sectionIndex < serializedSections.length; sectionIndex += 1) {
    const previousIndex = selected[sectionIndex]!;
    for (let variantIndex = 0; variantIndex < previousIndex; variantIndex += 1) {
      selected[sectionIndex] = variantIndex;
      const candidate = render();
      if (byteLength(candidate) <= maximumBytes) {
        prompt = candidate;
        break;
      }
      selected[sectionIndex] = previousIndex;
    }
  }

  return prompt;
};
