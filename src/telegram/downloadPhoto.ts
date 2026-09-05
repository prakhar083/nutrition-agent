import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Context } from "telegraf";

/**
 * Downloads the largest size of an incoming Telegram photo to a temp file and
 * returns its path. Callers must delete the file (e.g. in a `finally` block) once
 * done with it — `runClaude`'s Read-based vision needs a real file path, not bytes.
 */
export async function downloadTelegramPhotoToTempFile(ctx: Context): Promise<string> {
  const message = ctx.message as { photo?: Array<{ file_id: string }> } | undefined;
  const photo = message?.photo?.at(-1);
  if (!photo) throw new Error("downloadTelegramPhotoToTempFile called without a photo message");

  const fileLink = await ctx.telegram.getFileLink(photo.file_id);
  const response = await fetch(fileLink.toString());
  const buffer = Buffer.from(await response.arrayBuffer());

  const tempPath = path.join(os.tmpdir(), `butler-photo-${photo.file_id}-${Date.now()}.jpg`);
  await fs.writeFile(tempPath, buffer);
  return tempPath;
}
