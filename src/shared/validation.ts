import { z } from "zod";
import { MEMBER_IDS } from "./contracts";

const memberId = z.enum(MEMBER_IDS);

export const createRequirementSchema = z.object({
  actorId: memberId,
  title: z.string().trim().min(2).max(80),
  content: z.string().trim().min(4).max(1200)
});

export const requirementActionSchema = z.object({
  actorId: memberId,
  requirementId: z.string().min(1)
});

export const changeRequirementSchema = requirementActionSchema.extend({
  title: z.string().trim().min(2).max(80).optional(),
  content: z.string().trim().min(4).max(1200),
  reason: z.string().trim().min(2).max(400)
});

export const generatePlanSchema = z.object({
  actorId: memberId
});

export const taskActionSchema = z.object({
  actorId: memberId,
  taskId: z.string().min(1)
});

export const resumeTaskSchema = taskActionSchema.extend({
  handoverId: z.string().min(1)
});

export const reviewSchema = taskActionSchema.extend({
  decision: z.enum(["approve", "return"]),
  comment: z.string().trim().max(1000)
});

export const mergeTaskSchema = taskActionSchema.extend({
  comment: z.string().trim().max(1000).optional()
});

export const memberSchema = memberId;
