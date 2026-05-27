import { Bot, InlineKeyboard } from "grammy";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db.js";
import {
  generateImageFromText,
  createHunyuan3D,
  getRequest,
  extractImageUrl,
  extractGlbUrl,
  extractThumbnailUrl,
} from "./genapi.js";
import { downloadFile } from "./storage.js";
import { cancelGenerationKeyboard } from "./keyboards.js";
import { generationStatusText } from "./messages.js";
import { logger } from "../lib/logger.js";

const POLL_INTERVAL = 5000;

// TEXT → 3D: step 1 generate image, step 2 generate 3D
export async function startTextGeneration(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  prompt: string,
  quality: string,
) {
  const db = getDb();
  try {
    // Phase 1: text → image
    await editStatus(bot, chatId, statusMsgId, generationId,
      `🎨 <b>Генерация превью изображения…</b>\n\n${generationStatusText("processing", 5, quality)}`);

    const imgRequestId = await generateImageFromText(prompt);
    await db.update(schema.generationsTable)
      .set({ meshyTaskId: imgRequestId, status: "processing", progress: 5 })
      .where(eq(schema.generationsTable.id, generationId));

    const imgResult = await pollUntilDone(bot, chatId, statusMsgId, generationId, imgRequestId, quality, 5, 30);
    if (!imgResult) return;

    const imageUrl = extractImageUrl(imgResult.output);
    if (!imageUrl) throw new Error("Не удалось получить изображение от API");

    await db.update(schema.generationsTable)
      .set({ previewImageUrl: imageUrl, progress: 30 })
      .where(eq(schema.generationsTable.id, generationId));

    // Send preview image to user
    try {
      await bot.api.sendPhoto(chatId, imageUrl, {
        caption: `🎨 Превью: <i>${prompt.slice(0, 80)}</i>\n⏳ Генерирую 3D-модель…`,
        parse_mode: "HTML",
      });
    } catch { /* non-critical */ }

    // Phase 2: image → 3D
    await editStatus(bot, chatId, statusMsgId, generationId,
      `🏗 <b>Создание 3D-модели…</b>\n\n${generationStatusText("processing", 35, quality)}`);

    const modelRequestId = await createHunyuan3D(imageUrl);
    await db.update(schema.generationsTable)
      .set({ meshyTaskId: modelRequestId, progress: 35 })
      .where(eq(schema.generationsTable.id, generationId));

    const modelResult = await pollUntilDone(bot, chatId, statusMsgId, generationId, modelRequestId, quality, 35, 95);
    if (!modelResult) return;

    await finalizeGeneration(bot, chatId, statusMsgId, generationId, modelResult, imageUrl, prompt, quality);
  } catch (err) {
    logger.error({ err, generationId }, "Text generation failed");
    await handleError(bot, chatId, statusMsgId, generationId, err);
  }
}

// IMAGE → 3D: directly pass image to Hunyuan 3D
export async function startImageGeneration(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  imageUrl: string,
  quality: string,
) {
  const db = getDb();
  try {
    await editStatus(bot, chatId, statusMsgId, generationId,
      `🔄 <b>Анализ изображения…</b>\n\n${generationStatusText("processing", 5, quality)}`);

    const requestId = await createHunyuan3D(imageUrl);
    await db.update(schema.generationsTable)
      .set({ meshyTaskId: requestId, status: "processing", progress: 5 })
      .where(eq(schema.generationsTable.id, generationId));

    const result = await pollUntilDone(bot, chatId, statusMsgId, generationId, requestId, quality, 5, 95);
    if (!result) return;

    await finalizeGeneration(bot, chatId, statusMsgId, generationId, result, imageUrl, "Из фото", quality);
  } catch (err) {
    logger.error({ err, generationId }, "Image generation failed");
    await handleError(bot, chatId, statusMsgId, generationId, err);
  }
}

async function pollUntilDone(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  requestId: string,
  quality: string,
  progressStart: number,
  progressEnd: number,
) {
  const db = getDb();
  let lastProgress = progressStart;

  while (true) {
    const [gen] = await db.select().from(schema.generationsTable)
      .where(eq(schema.generationsTable.id, generationId));
    if (!gen || gen.status === "cancelled") return null;

    const req = await getRequest(requestId);
    logger.info({ requestId, status: req.status, progress: req.progress }, "Poll");

    if (req.status === "completed") return req;
    if (req.status === "failed" || req.status === "error") {
      throw new Error(req.error ?? "Генерация завершилась с ошибкой");
    }

    const raw = typeof req.progress === "number" ? req.progress : 0;
    const mapped = Math.round(progressStart + (raw / 100) * (progressEnd - progressStart));
    const newProgress = Math.max(mapped, lastProgress);
    lastProgress = newProgress;

    await db.update(schema.generationsTable)
      .set({ progress: newProgress })
      .where(eq(schema.generationsTable.id, generationId));

    try {
      await editStatus(bot, chatId, statusMsgId, generationId,
        `⚙️ <b>Генерация…</b>\n\n${generationStatusText("processing", newProgress, quality)}`);
    } catch { /* message unchanged */ }

    await sleep(POLL_INTERVAL);
  }
}

async function finalizeGeneration(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  req: Awaited<ReturnType<typeof getRequest>>,
  previewImageUrl: string,
  prompt: string,
  quality: string,
) {
  const db = getDb();

  const glbUrl = extractGlbUrl(req.output);
  const thumbnailUrl = extractThumbnailUrl(req.output) ?? previewImageUrl;

  logger.info({ generationId, glbUrl, output: req.output }, "Generation completed");

  let localGlbPath: string | undefined;
  if (glbUrl) {
    try {
      localGlbPath = await downloadFile(glbUrl, `gen_${generationId}.glb`);
    } catch (err) {
      logger.warn({ err }, "Could not download GLB");
    }
  }

  await db.update(schema.generationsTable)
    .set({ status: "completed", progress: 100, modelUrlGlb: glbUrl, localGlbPath, thumbnailUrl })
    .where(eq(schema.generationsTable.id, generationId));

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  const viewerUrl = domain && glbUrl
    ? `https://${domain}/viewer/?model=${encodeURIComponent(glbUrl)}&title=${encodeURIComponent(prompt.slice(0, 60))}&id=${generationId}`
    : null;

  const kb = new InlineKeyboard();
  if (viewerUrl) {
    kb.webApp("👁 Просмотр 3D", viewerUrl).row();
  }
  kb.text("⬇ Скачать GLB", `download_glb_${generationId}`).text("◀ Меню", "menu_back");

  await bot.api.editMessageText(
    chatId, statusMsgId,
    `✅ <b>3D-модель готова!</b>\n\n🎉 Генерация завершена.\n📁 Формат: GLB${viewerUrl ? "\n\n👁 Нажмите «Просмотр 3D» для интерактивного вращения!" : ""}`,
    { parse_mode: "HTML", reply_markup: kb },
  );
}

async function editStatus(
  bot: Bot,
  chatId: number,
  msgId: number,
  generationId: number,
  text: string,
) {
  try {
    await bot.api.editMessageText(chatId, msgId, text, {
      parse_mode: "HTML",
      reply_markup: cancelGenerationKeyboard(generationId),
    });
  } catch { /* ignore "message not modified" */ }
}

async function handleError(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  err: unknown,
) {
  const db = getDb();
  const msg = err instanceof Error ? err.message : String(err);
  await db.update(schema.generationsTable)
    .set({ status: "failed", errorMessage: msg.slice(0, 500) })
    .where(eq(schema.generationsTable.id, generationId));
  try {
    await bot.api.editMessageText(chatId, statusMsgId,
      `❌ <b>Ошибка генерации</b>\n\nПопробуйте снова.\n\n<i>${msg.slice(0, 200)}</i>`,
      { parse_mode: "HTML" });
  } catch { /* ignore */ }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
