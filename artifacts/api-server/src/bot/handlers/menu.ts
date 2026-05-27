import { Bot } from "grammy";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "../db.js";
import {
  mainMenuKeyboard,
  qualityKeyboard,
  historyItemKeyboard,
  backToMenuKeyboard,
} from "../keyboards.js";
import { profileText, QUALITY_LABELS, QUALITY_TIMES } from "../messages.js";
import type { BotContext } from "../context.js";

export function registerMenuHandlers(bot: Bot<BotContext>) {
  // Back to main menu
  bot.callbackQuery("menu_back", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = "idle";
    const firstName = ctx.from?.first_name ?? "Пользователь";
    await ctx.editMessageText(
      `👋 Привет, <b>${firstName}</b>!\n\nВыберите действие:`,
      { parse_mode: "HTML", reply_markup: mainMenuKeyboard() },
    );
  });

  // Create from text
  bot.callbackQuery("menu_text", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = "awaiting_text_prompt";
    await ctx.editMessageText(
      `✨ <b>Создание 3D-модели по тексту</b>\n\nОпишите объект, который хотите создать.\n\n<i>Например: "красный спортивный автомобиль Ferrari", "деревянный стул с подушкой", "дракон с распростёртыми крыльями"</i>`,
      { parse_mode: "HTML", reply_markup: backToMenuKeyboard() },
    );
  });

  // Create from photo
  bot.callbackQuery("menu_image", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = "awaiting_image";
    await ctx.editMessageText(
      `🖼 <b>Создание 3D-модели из фото</b>\n\nОтправьте изображение объекта, который хотите превратить в 3D-модель.\n\n<i>Лучшие результаты: чёткое фото на однотонном фоне, хорошее освещение</i>`,
      { parse_mode: "HTML", reply_markup: backToMenuKeyboard() },
    );
  });

  // Quality settings menu
  bot.callbackQuery("menu_quality", async (ctx) => {
    await ctx.answerCallbackQuery();
    const db = getDb();
    const tgId = String(ctx.from?.id ?? "");
    const [user] = await db
      .select()
      .from(schema.usersTable)
      .where(eq(schema.usersTable.telegramId, tgId));
    const current = user?.defaultQuality ?? "standard";

    await ctx.editMessageText(
      `⚙ <b>Настройки качества</b>\n\n` +
        `Текущее: <b>${QUALITY_LABELS[current] ?? current}</b>\n\n` +
        `Выберите качество по умолчанию:\n\n` +
        `⚡ <b>Быстрое</b> — ${QUALITY_TIMES.fast}, черновик\n` +
        `🔷 <b>Стандартное</b> — ${QUALITY_TIMES.standard}\n` +
        `💎 <b>Высокое</b> — ${QUALITY_TIMES.high}\n` +
        `🌟 <b>Ultra HD</b> — ${QUALITY_TIMES.ultra}, максимум`,
      { parse_mode: "HTML", reply_markup: qualityKeyboard("set_quality") },
    );
  });

  // Set quality handlers
  for (const q of ["fast", "standard", "high", "ultra"]) {
    bot.callbackQuery(`set_quality_${q}`, async (ctx) => {
      await ctx.answerCallbackQuery(`Установлено: ${QUALITY_LABELS[q]}`);
      const db = getDb();
      const tgId = String(ctx.from?.id ?? "");
      await db
        .update(schema.usersTable)
        .set({ defaultQuality: q })
        .where(eq(schema.usersTable.telegramId, tgId));
      ctx.session.quality = q;
      await ctx.editMessageText(
        `✅ Качество по умолчанию установлено: <b>${QUALITY_LABELS[q]}</b>`,
        { parse_mode: "HTML", reply_markup: backToMenuKeyboard() },
      );
    });
  }

  // Profile
  bot.callbackQuery("menu_profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    const db = getDb();
    const tgId = String(ctx.from?.id ?? "");
    const [user] = await db
      .select()
      .from(schema.usersTable)
      .where(eq(schema.usersTable.telegramId, tgId));
    const firstName = ctx.from?.first_name ?? "Пользователь";

    await ctx.editMessageText(
      profileText(
        firstName,
        user?.defaultQuality ?? "standard",
        user?.generationsUsed ?? 0,
        user?.generationsLimit ?? 10,
        user?.isPremium ?? false,
      ),
      { parse_mode: "HTML", reply_markup: backToMenuKeyboard() },
    );
  });

  // History
  bot.callbackQuery("menu_history", async (ctx) => {
    await ctx.answerCallbackQuery();
    const db = getDb();
    const tgId = String(ctx.from?.id ?? "");
    const items = await db
      .select()
      .from(schema.generationsTable)
      .where(eq(schema.generationsTable.telegramId, tgId))
      .orderBy(desc(schema.generationsTable.createdAt))
      .limit(10);

    if (items.length === 0) {
      await ctx.editMessageText(
        `📂 <b>История моделей</b>\n\nУ вас пока нет созданных моделей.\nНажмите «✨ Создать 3D-модель» для начала!`,
        { parse_mode: "HTML", reply_markup: backToMenuKeyboard() },
      );
      return;
    }

    const lines = items.map((g, i) => {
      const date = g.createdAt.toLocaleDateString("ru-RU");
      const statusIcon =
        g.status === "completed" ? "✅" : g.status === "failed" ? "❌" : "⏳";
      const promptShort = (g.prompt ?? "Из фото").slice(0, 40);
      return `${i + 1}. ${statusIcon} <b>${promptShort}</b>\n   📅 ${date} · ${QUALITY_LABELS[g.quality] ?? g.quality}`;
    });

    // Show history list with download buttons for first completed item
    const completedItem = items.find((g) => g.status === "completed");
    await ctx.editMessageText(
      `📂 <b>История моделей</b>\n\n${lines.join("\n\n")}`,
      {
        parse_mode: "HTML",
        reply_markup: completedItem
          ? historyItemKeyboard(completedItem.id)
          : backToMenuKeyboard(),
      },
    );
  });
}
