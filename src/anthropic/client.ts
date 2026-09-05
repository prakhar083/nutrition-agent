import { spawn } from "node:child_process";

/**
 * Invokes Claude via the `claude` CLI in headless print mode, authenticated through
 * the machine's logged-in Claude subscription rather than a billed ANTHROPIC_API_KEY.
 * This is the only place in the app that shells out to the CLI — every caller goes
 * through `runClaude`.
 */
export interface RunClaudeOptions {
  /** Full model name, e.g. "claude-opus-5" or "claude-sonnet-5". */
  model: string;
  systemPrompt: string;
  /** Plain-text user turn. Omit when passing `imagePath` instead. */
  userText?: string;
  /**
   * Path to an image file on disk. When set, the prompt asks Claude to Read it and
   * `Read` is the only tool permission granted for this call.
   */
  imagePath?: string;
}

interface ClaudeCliResult {
  is_error: boolean;
  result?: string;
  subtype?: string;
}

export async function runClaude(options: RunClaudeOptions): Promise<string> {
  const { model, systemPrompt, userText, imagePath } = options;

  const prompt = imagePath
    ? `Read the image at ${imagePath}.${userText ? ` ${userText}` : ""}`
    : userText ?? "";

  const args = [
    "-p",
    prompt,
    "--append-system-prompt",
    systemPrompt,
    "--output-format",
    "json",
    "--model",
    model,
    "--permission-prompts",
    "none",
  ];
  if (imagePath) {
    args.push("--allowedTools", "Read");
  }

  const stdout = await execClaude(args);

  let parsed: ClaudeCliResult;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`claude CLI returned non-JSON output: ${stdout.slice(0, 500)}`);
  }

  if (parsed.is_error) {
    throw new Error(`claude CLI reported an error (${parsed.subtype ?? "unknown"}): ${parsed.result ?? ""}`);
  }

  return stripCodeFence(parsed.result ?? "");
}

/**
 * Claude sometimes wraps its answer in a markdown code fence (more often when a
 * tool like Read was used mid-turn) even when told to respond with only raw JSON/
 * text. Strip a single leading/trailing fence so callers can parse the result directly.
 */
function stripCodeFence(text: string): string {
  const match = text.trim().match(/^```(?:\w+)?\n([\s\S]*?)\n?```$/);
  return match ? match[1] : text;
}

function execClaude(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`claude CLI exited with code ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve(stdout);
      }
    });
  });
}
