export const QUALITY_LABELS: Record<string, string> = {
  fast: "⚡ Быстрое (черновик)",
  standard: "🔷 Стандартное",
  high: "💎 Высокое",
  ultra: "🌟 Ultra HD",
};

export const QUALITY_TIMES: Record<string, string> = {
  fast: "~1-2 мин",
  standard: "~3-5 мин",
  high: "~7-10 мин",
  ultra: "~15-20 мин",
};

export function progressBar(pct: number): string {
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

export function welcomeText(firstName: string): string {
  return (
    `👋 Привет, <b>${firstName}</b>!\n\n` +
    `Я — бот для генерации профессиональных <b>3D-моделей</b> на основе ИИ.\n\n` +
    `Опишите объект текстом или пришлите фото — и я создам для вас высококачественную 3D-модель.\n\n` +
    `Выберите действие из меню ниже:`
  );
}

export function profileText(
  firstName: string,
  quality: string,
  used: number,
  limit: number,
  isPremium: boolean,
): string {
  const bar = progressBar(Math.round((used / Math.max(limit, 1)) * 100));
  return (
    `👤 <b>Профиль</b>\n\n` +
    `Имя: <b>${firstName}</b>\n` +
    `Статус: ${isPremium ? "⭐ Premium" : "🆓 Free"}\n\n` +
    `⚙️ Качество по умолчанию: <b>${QUALITY_LABELS[quality] ?? quality}</b>\n\n` +
    `📊 Использовано генераций:\n` +
    `${bar} <b>${used}/${limit}</b>`
  );
}

export function generationStatusText(
  status: string,
  progress: number,
  quality: string,
): string {
  const bar = progressBar(progress);
  let phase = "";
  if (progress < 20) phase = "🔄 Создание превью…";
  else if (progress < 50) phase = "🏗 Генерация геометрии…";
  else if (progress < 80) phase = "✨ Оптимизация сетки…";
  else if (progress < 100) phase = "📦 Подготовка файлов…";
  else phase = "✅ Готово!";

  const timeLeft =
    progress > 0
      ? Math.round(((100 - progress) / 100) * parseInt(QUALITY_TIMES[quality]?.match(/\d+/)?.[0] ?? "5")) + " мин"
      : QUALITY_TIMES[quality] ?? "?";

  return (
    `${phase}\n\n` +
    `${bar} <b>${progress}%</b>\n\n` +
    `⏱ Качество: <b>${QUALITY_LABELS[quality] ?? quality}</b>\n` +
    `⏳ Примерное время: <b>${timeLeft}</b>`
  );
}
