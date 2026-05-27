import { InlineKeyboard } from "grammy";

export function mainMenuKeyboard() {
  return new InlineKeyboard()
    .text("✨ Создать 3D-модель", "menu_text").row()
    .text("🖼 Создать из фото", "menu_image").row()
    .text("📂 История моделей", "menu_history").row()
    .text("⚙ Настройки качества", "menu_quality").row()
    .text("👤 Профиль", "menu_profile").text("⭐ Premium", "menu_premium");
}

export function qualityKeyboard(prefix: string = "quality") {
  return new InlineKeyboard()
    .text("⚡ Быстрое", `${prefix}_fast`).row()
    .text("🔷 Стандартное", `${prefix}_standard`).row()
    .text("💎 Высокое", `${prefix}_high`).row()
    .text("🌟 Ultra HD", `${prefix}_ultra`).row()
    .text("◀ Назад", "menu_back");
}

export function confirmPreviewKeyboard(generationId: number) {
  return new InlineKeyboard()
    .text("✅ Моделировать", `confirm_${generationId}`)
    .text("❌ Отмена", `cancel_${generationId}`);
}

export function cancelGenerationKeyboard(generationId: number) {
  return new InlineKeyboard()
    .text("⛔ Отменить генерацию", `cancel_${generationId}`);
}

export function downloadKeyboard(generationId: number) {
  return new InlineKeyboard()
    .text("⬇ Скачать STL", `download_stl_${generationId}`)
    .text("⬇ OBJ", `download_obj_${generationId}`)
    .text("⬇ GLB", `download_glb_${generationId}`);
}

export function historyItemKeyboard(generationId: number) {
  return new InlineKeyboard()
    .text("⬇ Скачать STL", `download_stl_${generationId}`)
    .text("◀ Назад", "menu_history");
}

export function backToMenuKeyboard() {
  return new InlineKeyboard().text("◀ Главное меню", "menu_back");
}
