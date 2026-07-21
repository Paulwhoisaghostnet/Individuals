export interface LlmRequestOptions {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly temperature?: number;
  readonly timeoutMs?: number;
}

export interface LlmClient {
  generateText(options: LlmRequestOptions): Promise<string>;
  generateJson<T>(
    options: LlmRequestOptions & { validator?: (data: unknown) => data is T },
  ): Promise<T>;
}

export interface FetchLlmClientConfig {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model?: string;
}

export class FetchLlmClient implements LlmClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: FetchLlmClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? process.env.LLM_API_BASE ?? "https://api.openai.com/v1";
    this.apiKey = config.apiKey ?? process.env.LLM_API_KEY ?? "";
    this.model = config.model ?? process.env.LLM_MODEL ?? "gpt-4o-mini";
  }

  async generateText(options: LlmRequestOptions): Promise<string> {
    if (!this.apiKey && !this.baseUrl.includes("localhost") && !this.baseUrl.includes("127.0.0.1")) {
      throw new Error("No LLM API key configured for remote endpoint.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: options.temperature ?? 0.7,
          messages: [
            { role: "system", content: options.systemPrompt },
            { role: "user", content: options.userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("Empty response content from LLM provider.");
      }

      return content;
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateJson<T>(
    options: LlmRequestOptions & { validator?: (data: unknown) => data is T },
  ): Promise<T> {
    const rawText = await this.generateText({
      ...options,
      systemPrompt: `${options.systemPrompt}\n\nCRITICAL: Respond ONLY with valid JSON. Do not include markdown code blocks, explanations, or chain-of-thought text.`,
    });

    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`Failed to parse LLM response as JSON: ${cleaned.slice(0, 100)}`);
    }

    if (options.validator && !options.validator(parsed)) {
      throw new Error("LLM JSON response failed validation schema.");
    }

    return parsed as T;
  }
}
