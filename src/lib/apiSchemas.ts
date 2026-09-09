import { z } from "zod";
import {
  NOTES_MAX_LENGTH,
  ROUND_ROBIN_MAX_ITEMS,
  ROUND_ROBIN_MIN_ITEMS,
  SEEDING_ROUNDS_DEFAULT,
  SEEDING_ROUNDS_MAX,
  SEEDING_ROUNDS_MIN,
  SWISS_MAX_ITEMS,
  SWISS_MIN_ITEMS,
} from "@/lib/limits";

export const LoginSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("admin"),
    username: z.string().min(1),
    password: z.string().min(1),
  }),
  z.object({
    mode: z.literal("participant"),
    nickname: z.string().trim().min(1).max(100),
    password: z.string().min(1),
  }),
]);

export const CreateEventSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(200),
  archivePreviousEventId: z.string().min(1).optional(),
});

export const PatchEventSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  status: z.literal("archived").optional(),
});

export const ParticipantExclusionSchema = z.object({
  tastingId: z.string().min(1),
  excluded: z.boolean(),
});

const baseTastingFields = {
  name: z.string().trim().min(1).max(200),
  portionAmount: z.number().positive(),
  portionUnit: z.enum(["ml", "g"]),
  hasGuessing: z.boolean(),
  hasBronzeMatch: z.boolean().default(false),
  timeLimitMinutes: z.number().int().positive().nullable().default(null),
  seedingRounds: z
    .number()
    .int()
    .min(SEEDING_ROUNDS_MIN)
    .max(SEEDING_ROUNDS_MAX)
    .default(SEEDING_ROUNDS_DEFAULT),
};

export const CreateTastingSchema = z
  .discriminatedUnion("logic", [
    z.object({
      ...baseTastingFields,
      logic: z.literal("ROUND_ROBIN"),
      itemNames: z
        .array(z.string().trim().min(1).max(100))
        .min(ROUND_ROBIN_MIN_ITEMS)
        .max(ROUND_ROBIN_MAX_ITEMS),
    }),
    z.object({
      ...baseTastingFields,
      logic: z.literal("SWISS_TOURNAMENT"),
      itemNames: z
        .array(z.string().trim().min(1).max(100))
        .min(SWISS_MIN_ITEMS)
        .max(SWISS_MAX_ITEMS),
    }),
  ])
  .refine((input) => new Set(input.itemNames).size === input.itemNames.length, {
    message: "Tuotteiden nimet eivät voi toistua.",
    path: ["itemNames"],
  });

export const ServeSchema = z.object({
  participantId: z.string().min(1),
  roundId: z.string().min(1),
});

export const SubmitRoundSchema = z
  .object({
    scoreA: z.number().int().min(0).max(50),
    notes: z.string().max(NOTES_MAX_LENGTH).default(""),
    guessAId: z.string().min(1).nullable().optional(),
    guessBId: z.string().min(1).nullable().optional(),
  })
  .refine(
    (input) =>
      input.guessAId == null || input.guessBId == null || input.guessAId !== input.guessBId,
    { message: "Et voi arvata samaa tuotetta molemmille.", path: ["guessBId"] }
  );
