import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

/** Shared Anthropic client — one instance for every call site in the app. */
export const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

/**
 * Extracts the first text block from a Claude response.
 *
 * On thinking-enabled models the response may contain thinking blocks before the
 * text block, so the first block is not necessarily the text one.
 */
export function firstText(response: Anthropic.Message, fallback = ""): string {
  return response.content.find((b) => b.type === "text")?.text ?? fallback;
}
