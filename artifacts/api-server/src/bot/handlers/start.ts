import { Bot } from "grammy";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db.js";
import { mainMenuKeyboard } from "../keyboards.js";
import { welcomeText } from "../messages.js";
import type { BotContext } from "../context.js";

export function registerStartHandlers(bot: Bot<BotContext>) {
  bot.command("start", async (ctx) => {
    const db = getDb();
    const tgId = String(ctx.from?.id ?? "");
    const firstName = ctx.from?.first_name ?? "Пользователь";

    // Upsert user
    const existing = await db
      .select()
      .from(schema.usersTable)
      .where(eq(schema.usersTable.telegramId, tgId));

    if (existing.length === 0) {
      await db.insert(schema.usersTable).values({
        telegramId: tgId,
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name,
        languageCode: ctx.from?.language_code ?? "ru",
      });
    }

    await ctx.reply(welcomeText(firstName), {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard(),
    });
  });

  bot.command("menu", async (ctx) => {
    const firstName = ctx.from?.first_name ?? "Пользователь";
    await ctx.reply(welcomeText(firstName), {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard(),
    });
  });
}
