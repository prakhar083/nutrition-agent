import type { Telegraf } from "telegraf";
import { videoLibraryRepo } from "../db/repositories/videoLibraryRepo.js";

const YOUTUBE_URL_RE = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)\S+)/i;

export function registerVideoLinkHandler(bot: Telegraf): void {
  bot.on("text", (ctx, next) => {
    const match = ctx.message.text.match(YOUTUBE_URL_RE);
    if (!match) return next();

    const url = match[1];
    const dishName = ctx.message.text.replace(url, "").trim();
    if (!dishName) {
      return ctx.reply("Send the dish name along with the link, e.g. `dal_rice <youtube link>`.");
    }
    videoLibraryRepo.set(dishName, url);
    return ctx.reply(`Saved that video for "${dishName}" — I'll include it next time that dish comes up.`);
  });
}
