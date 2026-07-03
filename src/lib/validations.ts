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
