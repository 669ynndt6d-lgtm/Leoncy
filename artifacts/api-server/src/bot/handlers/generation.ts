import { Bot, InputFile } from "grammy";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db.js";
import {
  confirmPreviewKeyboard,
  cancelGenerationKeyboard,
  qualityKeyboard,
  backToMenuKeyboard,
  downloadKeyboard,
} from "../keyboards.js";
import { QUALITY_LABELS, QUALITY_TIMES } from "../messages.js";
import { startTextGeneration, startImageGeneration } from "../processor.js";
import type { BotContext } from "../context.js";
import { logger } from "../../lib/logger.js";
import fs from "node:fs";
import path from "node:path";

export function registerGenerationHandlers(bot: Bot<BotContext>) {
  // Text message handler — captures prompt when in awaiting_text_prompt state
  bot.on("message:text", async (ctx) => {
    if (ctx.session.step !== "awaiting_text_prompt") return;

    const prompt = ctx.message.text.trim();
    if (!prompt) return;

    ctx.session.step = "idle";

    const db = getDb();
    const tgId = String(ctx.from?.id ?? "");

    // Get user quality preference
    const [user] = await db
      .select()
      .from(schema.usersTable)
      .where(eq(schema.usersTable.telegramId, tgId));

    // Check limits
    const used = user?.generationsUsed ?? 0;
    const limit = user?.generationsLimit ?? 10;
    if (used >= limit) {
      await ctx.reply(
        `❌ <b>Лимит генераций исчерпан</b>\n\nВы использовали все ${limit} генераций.\nДля продолжения оформите Premium-подписку.`,
        { parse_mode: "HTML", reply_markup: backToMenuKeyboard() },
      );
      return;
    }

    const quality = ctx.session.quality || user?.defaultQuality || "standard";
    ctx.session.quality = quality;
    ctx.session.pendingPrompt = prompt;

    // Show quality selection before starting
    const statusMsg = await ctx.reply(
      `✨ <b>Новая 3D-модель</b>\n\n📝 Описание: <i>${prompt.slice(0, 100)}</i>\n\nВыберите качество генерации:\n\n` +
        `⚡ <b>Быстрое</b> — ${QUALITY_TIMES.fast}\n` +
        `🔷 <b>Стандартное</b> — ${QUALITY_TIMES.standard}\n` +
        `💎 <b>Высокое</b> — ${QUALITY_TIMES.high}\n` +
        `🌟 <b>Ultra HD</b> — ${QUALITY_TIMES.ultra}`,
      { parse_mode: "HTML", reply_markup: qualityKeyboard("gen_quality") },
    );
  });

  // Quality selection for generation
  for (const q of ["fast", "standard", "high", "ultra"]) {
    bot.callbackQuery(`gen_quality_${q}`, async (ctx) => {
      await ctx.answerCallbackQuery();
      ctx.session.quality = q;

      const prompt = ctx.session.pendingPrompt;
      if (!prompt) {
        await ctx.editMessageText("❌ Ошибка: потерян запрос. Начните заново.", {
          reply_markup: backToMenuKeyboard(),
        });
        return;
      }

      const db = getDb();
      const tgId = String(ctx.from?.id ?? "");

      // Create generation record
      const [gen] = await db
        .insert(schema.generationsTable)
        .values({
          telegramId: tgId,
          type: "text",
          prompt,
          quality: q,
          status: "processing",
          progress: 0,
        })
        .returning();

      ctx.session.pendingGenerationId = gen.id;
      ctx.session.pendingPrompt = undefined;

      await ctx.editMessageText(
        `🚀 <b>Запуск генерации…</b>\n\n📝 <i>${prompt.slice(0, 80)}</i>\n⚙ Качество: <b>${QUALITY_LABELS[q]}</b>`,
        { parse_mode: "HTML", reply_markup: cancelGenerationKeyboard(gen.id) },
      );

      const chatId = ctx.chat?.id;
      const msgId = ctx.callbackQuery.message?.message_id;
      if (!chatId || !msgId) return;

      // Fire and forget — non-blocking
      startTextGeneration(bot, chatId, msgId, gen.id, prompt, q).catch((err) =>
        logger.error({ err }, "startTextGeneration error"),
      );
    });
  }

  // Photo message handler
  bot.on("message:photo", async (ctx) => {
    if (ctx.session.step !== "awaiting_image") return;

    ctx.session.step = "idle";

    const db = getDb();
    const tgId = String(ctx.from?.id ?? "");

    const [user] = await db
      .select()
      .from(schema.usersTable)
      .where(eq(schema.usersTable.telegramId, tgId));

    const used = user?.generationsUsed ?? 0;
    const limit = user?.generationsLimit ?? 10;
    if (used >= limit) {
      await ctx.reply(
        `❌ <b>Лимит генераций исчерпан</b>`,
        { parse_mode: "HTML", reply_markup: backToMenuKeyboard() },
      );
      return;
    }

    const quality = ctx.session.quality || user?.defaultQuality || "standard";

    // Get photo file
    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];
    const file = await ctx.api.getFile(largest.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    // Create generation record
    const [gen] = await db
      .insert(schema.generationsTable)
      .values({
        telegramId: tgId,
        type: "image",
        prompt: "Из фото",
        quality,
        status: "processing",
        progress: 0,
        previewImageUrl: fileUrl,
      })
      .returning();

    const statusMsg = await ctx.reply(
      `🖼 <b>Фото получено!</b>\n\n⚙ Качество: <b>${QUALITY_LABELS[quality]}</b>\n\n🔄 Начинаю генерацию 3D-модели…`,
      { parse_mode: "HTML", reply_markup: cancelGenerationKeyboard(gen.id) },
    );

    startImageGeneration(bot, statusMsg.chat.id, statusMsg.message_id, gen.id, fileUrl, quality).catch(
      (err) => logger.error({ err }, "startImageGeneration error"),
    );
  });

  // Cancel generation
  bot.callbackQuery(/^cancel_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery("Отменено");
    const genId = parseInt(ctx.match[1]);
    const db = getDb();

    await db
      .update(schema.generationsTable)
      .set({ status: "cancelled" })
      .where(eq(schema.generationsTable.id, genId));

    await ctx.editMessageText(
      `⛔ <b>Генерация отменена</b>\n\nВы можете создать новую модель в главном меню.`,
      { parse_mode: "HTML", reply_markup: backToMenuKeyboard() },
    );
  });

  // Download STL (we send GLB as OBJ is the closest we have without STL conversion)
  bot.callbackQuery(/^download_stl_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery("Подготовка файла…");
    const genId = parseInt(ctx.match[1]);
    await sendModelFile(ctx, genId, "glb", "stl");
  });

  bot.callbackQuery(/^download_obj_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery("Подготовка файла…");
    const genId = parseInt(ctx.match[1]);
    await sendModelFile(ctx, genId, "obj", "obj");
  });

  bot.callbackQuery(/^download_glb_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery("Подготовка файла…");
    const genId = parseInt(ctx.match[1]);
    await sendModelFile(ctx, genId, "glb", "glb");
  });
}

async function sendModelFile(
  ctx: any,
  genId: number,
  format: "glb" | "obj",
  label: string,
) {
  const db = getDb();
  const [gen] = await db
    .select()
    .from(schema.generationsTable)
    .where(eq(schema.generationsTable.id, genId));

  if (!gen || gen.status !== "completed") {
    await ctx.reply("❌ Модель ещё не готова или не найдена.");
    return;
  }

  const localPath = format === "glb" ? gen.localGlbPath : gen.localObjPath;
  const remoteUrl = format === "glb" ? gen.modelUrlGlb : gen.modelUrlObj;

  if (localPath && fs.existsSync(localPath)) {
    await ctx.replyWithDocument(new InputFile(localPath, `model_${genId}.${label}`), {
      caption: `📦 Ваша 3D-модель #${genId} (.${label})`,
    });
  } else if (remoteUrl) {
    await ctx.replyWithDocument(new InputFile(new URL(remoteUrl), `model_${genId}.${label}`), {
      caption: `📦 Ваша 3D-модель #${genId} (.${label})`,
    });
  } else {
    await ctx.reply("❌ Файл недоступен. Попробуйте снова.");
  }
}
