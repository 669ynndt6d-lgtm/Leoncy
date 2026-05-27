import { Bot, InputFile } from "grammy";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db.js";
import {
  createTextTo3DPreview,
  createTextTo3DRefine,
  createImageTo3D,
  getTask,
  getImageTask,
  qualityToMeshy,
} from "./meshy.js";
import { downloadFile } from "./storage.js";
import {
  cancelGenerationKeyboard,
  downloadKeyboard,
} from "./keyboards.js";
import { generationStatusText } from "./messages.js";
import { logger } from "../lib/logger.js";
import path from "node:path";

const POLL_INTERVAL = 5000;

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
    // Step 1: Create preview task
    await bot.api.editMessageText(
      chatId,
      statusMsgId,
      `🔄 <b>Создание превью…</b>\n\n${generationStatusText("processing", 5, quality)}`,
      {
        parse_mode: "HTML",
        reply_markup: cancelGenerationKeyboard(generationId),
      },
    );

    const previewTaskId = await createTextTo3DPreview(prompt);
    await db
      .update(schema.generationsTable)
      .set({ meshyTaskId: previewTaskId, status: "processing", progress: 5 })
      .where(eq(schema.generationsTable.id, generationId));

    // Poll until preview complete
    const previewTask = await pollTask(
      bot, chatId, statusMsgId, generationId, previewTaskId, quality, "text", 5, 45,
    );
    if (!previewTask) return;

    const thumbnailUrl = previewTask.thumbnail_url;
    if (thumbnailUrl) {
      await db
        .update(schema.generationsTable)
        .set({ thumbnailUrl, progress: 45 })
        .where(eq(schema.generationsTable.id, generationId));
    }

    // Step 2: Refine task
    await bot.api.editMessageText(
      chatId,
      statusMsgId,
      `✨ <b>Оптимизация сетки…</b>\n\n${generationStatusText("processing", 50, quality)}`,
      {
        parse_mode: "HTML",
        reply_markup: cancelGenerationKeyboard(generationId),
      },
    );

    const refineTaskId = await createTextTo3DRefine(previewTaskId, qualityToMeshy(quality));
    await db
      .update(schema.generationsTable)
      .set({ meshyTaskId: refineTaskId, progress: 50 })
      .where(eq(schema.generationsTable.id, generationId));

    const refineTask = await pollTask(
      bot, chatId, statusMsgId, generationId, refineTaskId, quality, "text", 50, 95,
    );
    if (!refineTask) return;

    await finalizeGeneration(bot, chatId, statusMsgId, generationId, refineTask, quality);
  } catch (err) {
    logger.error({ err, generationId }, "Text generation failed");
    await handleGenerationError(bot, chatId, statusMsgId, generationId, String(err));
  }
}

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
    await bot.api.editMessageText(
      chatId,
      statusMsgId,
      `🔄 <b>Анализ изображения…</b>\n\n${generationStatusText("processing", 5, quality)}`,
      {
        parse_mode: "HTML",
        reply_markup: cancelGenerationKeyboard(generationId),
      },
    );

    const taskId = await createImageTo3D(imageUrl, qualityToMeshy(quality));
    await db
      .update(schema.generationsTable)
      .set({ meshyTaskId: taskId, status: "processing", progress: 5 })
      .where(eq(schema.generationsTable.id, generationId));

    const task = await pollTask(
      bot, chatId, statusMsgId, generationId, taskId, quality, "image", 5, 95,
    );
    if (!task) return;

    await finalizeGeneration(bot, chatId, statusMsgId, generationId, task, quality);
  } catch (err) {
    logger.error({ err, generationId }, "Image generation failed");
    await handleGenerationError(bot, chatId, statusMsgId, generationId, String(err));
  }
}

async function pollTask(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  taskId: string,
  quality: string,
  type: "text" | "image",
  progressStart: number,
  progressEnd: number,
) {
  const db = getDb();

  while (true) {
    // Check if cancelled
    const [gen] = await db
      .select()
      .from(schema.generationsTable)
      .where(eq(schema.generationsTable.id, generationId));

    if (!gen || gen.status === "cancelled") {
      return null;
    }

    const task = type === "image" ? await getImageTask(taskId) : await getTask(taskId);

    if (task.status === "SUCCEEDED") {
      return task;
    }

    if (task.status === "FAILED" || task.status === "EXPIRED") {
      throw new Error(task.task_error?.message ?? "Task failed");
    }

    const rawProgress = task.progress ?? 0;
    const mappedProgress = Math.round(
      progressStart + (rawProgress / 100) * (progressEnd - progressStart),
    );

    await db
      .update(schema.generationsTable)
      .set({ progress: mappedProgress })
      .where(eq(schema.generationsTable.id, generationId));

    try {
      await bot.api.editMessageText(
        chatId,
        statusMsgId,
        `⚙️ <b>Генерация модели…</b>\n\n${generationStatusText("processing", mappedProgress, quality)}`,
        {
          parse_mode: "HTML",
          reply_markup: cancelGenerationKeyboard(generationId),
        },
      );
    } catch {
      // message not modified — ok
    }

    await sleep(POLL_INTERVAL);
  }
}

async function finalizeGeneration(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  task: Awaited<ReturnType<typeof getTask>>,
  quality: string,
) {
  const db = getDb();

  await bot.api.editMessageText(
    chatId,
    statusMsgId,
    `📦 <b>Подготовка файлов…</b>\n\n${generationStatusText("processing", 95, quality)}`,
    {
      parse_mode: "HTML",
      reply_markup: cancelGenerationKeyboard(generationId),
    },
  );

  // Download available model files
  const glbUrl = task.model_urls?.glb;
  const objUrl = task.model_urls?.obj;
  const thumbUrl = task.thumbnail_url;

  let localGlbPath: string | undefined;
  let localObjPath: string | undefined;
  let thumbnailUrl: string | undefined = thumbUrl;

  if (glbUrl) {
    localGlbPath = await downloadFile(glbUrl, `gen_${generationId}.glb`);
  }
  if (objUrl) {
    localObjPath = await downloadFile(objUrl, `gen_${generationId}.obj`);
  }

  await db
    .update(schema.generationsTable)
    .set({
      status: "completed",
      progress: 100,
      modelUrlGlb: glbUrl,
      modelUrlObj: objUrl,
      localGlbPath,
      localObjPath,
      thumbnailUrl,
    })
    .where(eq(schema.generationsTable.id, generationId));

  // Send completion message
  await bot.api.editMessageText(
    chatId,
    statusMsgId,
    `✅ <b>3D-модель готова!</b>\n\n🎉 Генерация завершена успешно.\nФорматы: GLB, OBJ`,
    {
      parse_mode: "HTML",
      reply_markup: downloadKeyboard(generationId),
    },
  );

  // Send thumbnail if available
  if (thumbnailUrl) {
    try {
      await bot.api.sendPhoto(chatId, thumbnailUrl, {
        caption: "🖼 Превью вашей 3D-модели",
      });
    } catch {
      // thumbnail send failure is non-critical
    }
  }
}

async function handleGenerationError(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  errorMsg: string,
) {
  const db = getDb();
  await db
    .update(schema.generationsTable)
    .set({ status: "failed", errorMessage: errorMsg })
    .where(eq(schema.generationsTable.id, generationId));

  try {
    await bot.api.editMessageText(
      chatId,
      statusMsgId,
      `❌ <b>Ошибка генерации</b>\n\nК сожалению, произошла ошибка. Попробуйте снова.\n\n<i>${errorMsg.slice(0, 200)}</i>`,
      { parse_mode: "HTML" },
    );
  } catch {
    // ignore
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
