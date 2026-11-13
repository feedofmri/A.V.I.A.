export type Fetcher = typeof fetch;
export class MuseError extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}
export const museConfigured = () =>
  Boolean(process.env.MODEL_API_KEY && process.env.META_MODEL);
// Meta's schema subset omits uniqueItems. Keep that rule in server validation.
function providerSchema(value: any): any {
  if (Array.isArray(value)) return value.map(providerSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "uniqueItems")
      .map(([key, child]) => [key, providerSchema(child)]),
  );
}
export async function museStructured(
  instructions: string,
  input: unknown,
  schema: unknown,
  fetcher: Fetcher = fetch,
) {
  if (!museConfigured()) throw new MuseError("not_configured");
  const until = Date.now() + 45000;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetcher("https://api.meta.ai/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.MODEL_API_KEY}`,
        },
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(25000, until - Date.now())),
        ),
        body: JSON.stringify({
          model: process.env.META_MODEL,
          store: false,
          max_output_tokens: 4000,
          reasoning: { effort: "low" },
          instructions,
          input: JSON.stringify(input),
          text: {
            format: {
              type: "json_schema",
              name: "avia_assistant",
              strict: true,
              schema: providerSchema(schema),
            },
          },
        }),
      });
      if (!r.ok) {
        if (
          [408, 429, 500, 502, 503, 504].includes(r.status) &&
          attempt === 0 &&
          Date.now() < until
        ) {
          await new Promise((x) => setTimeout(x, 150));
          continue;
        }
        throw new MuseError("provider_" + r.status);
      }
      const text = await r.text();
      if (text.length > 100000) throw new MuseError("oversized_output");
      const result = JSON.parse(text);
      if (result.status !== "completed")
        throw new MuseError("incomplete_output");
      const output = result.output
        ?.flatMap((x: any) => x.content ?? [])
        .filter((x: any) => x.type === "output_text")
        .map((x: any) => x.text)
        .join("");
      if (!output) throw new MuseError("empty_output");
      return JSON.parse(output);
    } catch (e) {
      if (e instanceof MuseError) throw e;
      if (attempt === 1 || Date.now() >= until)
        throw new MuseError("unavailable_or_invalid_output");
    }
  }
  throw new MuseError("unavailable");
}
