/**
 * Claude, called only from Convex actions. ANTHROPIC_API_KEY never leaves the server.
 * Used for one thing: reading a spoken Feel Check answer that keyword matching couldn't.
 */

import Anthropic from "@anthropic-ai/sdk";
import { env } from "./_generated/server";
import type { FeelAnswer } from "../shared/types";

const SYSTEM = `You classify one short spoken answer from someone meditating with their eyes closed.
They were asked: "Focused or drifting?". Their answer is a speech-to-text transcript, so expect
filler words, hesitation and transcription errors.

Map it to exactly one label:
- "focused": attention was on the breath or present ("here", "pretty good", "clear", "with it").
- "drifting": attention had wandered ("floaty", "thinking about exams", "kind of gone", "distracted").
- "sleepy": drowsy or nodding off ("tired", "heavy", "half asleep").
- "unclear": not an answer to the question, or impossible to tell.

This is a wellness exercise. Never add advice, diagnosis or commentary. Return only the label.`;

const LABELS = ["focused", "drifting", "sleepy", "unclear"] as const;

/** null when Claude isn't configured, the answer is unclear, or the call fails. */
export async function classifyFeelAnswer(transcript: string): Promise<FeelAnswer | null> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY not set; unclear Feel Check answers stay unanswered");
    return null;
  }
  const client = new Anthropic({ apiKey, timeout: 15_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      // If a safety classifier declines, re-run on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      max_tokens: 1024,
      // A one-word label from a short transcript: low effort keeps it fast while the user waits.
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { label: { type: "string", enum: [...LABELS] } },
            required: ["label"],
            additionalProperties: false,
          },
        },
      },
      system: SYSTEM,
      messages: [{ role: "user", content: `Transcript: ${JSON.stringify(transcript)}` }],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const label: unknown = (JSON.parse(text.text) as { label?: unknown }).label;
    return label === "focused" || label === "drifting" || label === "sleepy" ? label : null;
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error(`Claude API error ${error.status}: ${error.message}`);
    else console.error("Claude classification failed", error);
    return null;
  }
}
