import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const generationsTable = pgTable("generations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  telegramId: text("telegram_id").notNull(),
  type: text("type").notNull(),
  prompt: text("prompt"),
  quality: text("quality").notNull().default("standard"),
  status: text("status").notNull().default("pending"),
  meshyTaskId: text("meshy_task_id"),
  previewImageUrl: text("preview_image_url"),
  previewLocalPath: text("preview_local_path"),
  modelUrlStl: text("model_url_stl"),
  modelUrlObj: text("model_url_obj"),
  modelUrlGlb: text("model_url_glb"),
  localStlPath: text("local_stl_path"),
  localObjPath: text("local_obj_path"),
  localGlbPath: text("local_glb_path"),
  thumbnailUrl: text("thumbnail_url"),
  progress: integer("progress").default(0),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGenerationSchema = createInsertSchema(generationsTable);
export type InsertGeneration = z.infer<typeof insertGenerationSchema>;
export type Generation = typeof generationsTable.$inferSelect;
