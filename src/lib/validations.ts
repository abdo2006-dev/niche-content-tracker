import { z } from "zod";

const PlatformEnum = z.enum(["YOUTUBE", "TIKTOK", "INSTAGRAM"]);

export const addCreatorSchema = z.object({
  platform: PlatformEnum,
  input: z.string().min(2, "Enter a URL, handle, or ID."),
  tagIds: z.array(z.string()).default([]),
  fetchRecent: z.boolean().default(true),
});

export const createTagSchema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().optional(),
});

export const renameTagSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  color: z.string().optional(),
});

export const createKeywordTrackerSchema = z.object({
  query: z.string().min(1),
  platforms: z.array(PlatformEnum).min(1, "Select at least one platform."),
  shortsOnly: z.boolean().default(false),
  maxAgeDays: z.number().int().min(1).max(365).default(30),
  tagIds: z.array(z.string()).default([]),
});

export const updateCreatorTagsSchema = z.object({ tagIds: z.array(z.string()) });
export const updateSettingSchema = z.object({ key: z.string(), value: z.string() });
export const createIdeaNoteSchema = z.object({ postId: z.string(), content: z.string().min(1).max(2000) });
export const createTodoVideoSchema = z.object({
  postId: z.string().optional(),
  groupId: z.string().nullable().optional(),
  groupTitle: z.string().min(1).max(120).optional(),
  title: z.string().min(1).max(240).optional(),
  url: z.string().url().optional(),
  notes: z.string().max(2000).optional(),
}).refine((v) => v.postId || (v.title && v.url), {
  message: "Choose a tracked post or enter a video title and URL.",
});
export const updateTodoVideoSchema = z.object({
  done: z.boolean().optional(),
  groupId: z.string().nullable().optional(),
  groupTitle: z.string().min(1).max(120).optional(),
  title: z.string().min(1).max(240).nullable().optional(),
  url: z.string().url().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export const createTodoGroupSchema = z.object({ title: z.string().min(1).max(120) });
export const updateTodoGroupSchema = z.object({ title: z.string().min(1).max(120) });
