import { z } from "zod";
import { ApiError } from "./errors.js";
import { OperationTypeSchema } from "./constants.js";

const coerceNumber = (schema: z.ZodNumber = z.number().finite()) =>
  z.preprocess((value) => {
    if (typeof value === "string" && value.trim() !== "") {
      return Number(value);
    }
    return value;
  }, schema) as z.ZodEffects<z.ZodNumber, number, unknown>;

const coerceInt = (schema: z.ZodNumber = z.number().int()) => coerceNumber(schema);

const booleanFromInput = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return value;
}, z.boolean());

const requiredString = z.string().trim().min(1);
const id = requiredString;

const RoomSettingsSchema = z.object({
  operation: OperationTypeSchema.optional(),
  selectedNumbers: z.array(coerceInt()).optional(),
  questionCount: coerceInt(z.number().int().min(1).max(50)).optional(),
  timeLimit: coerceInt(z.number().int().min(0)).optional(),
  maxPlayers: coerceInt(z.number().int().min(2).max(4)).optional(),
  gameMode: z.enum(["ffa", "teams"]).optional(),
}).passthrough();

export const SubmitScoreSchema = z.object({
  playerName: z.string().trim().min(1).max(50),
  score: coerceInt(z.number().int().min(0)),
  operationType: OperationTypeSchema,
  questionCount: coerceInt(),
  selectedNumbersCount: coerceInt(),
  allNumbersSelected: booleanFromInput,
});

export const CheckScoreSchema = z.object({
  operationType: OperationTypeSchema,
  score: coerceInt(z.number().int().min(0)),
  questionCount: coerceInt(),
  selectedNumbersCount: coerceInt(),
  allNumbersSelected: booleanFromInput,
});

export const GetLeaderboardQuerySchema = z.object({
  operationType: OperationTypeSchema,
});

export const GetHallOfFameQuerySchema = z.object({
  operationType: OperationTypeSchema,
  year: coerceInt(z.number().int().min(2024).max(2100)),
  month: coerceInt(z.number().int().min(1).max(12)),
});

export const GetHallOfFameDatesQuerySchema = z.object({}).passthrough();

const ExplanationBaseSchema = z.object({
  num1: coerceNumber(),
  num2: coerceNumber().optional(),
  operation: OperationTypeSchema,
  answer: z.union([z.string(), coerceNumber()]),
});

export const ExplanationRequestSchema = ExplanationBaseSchema.superRefine((value, ctx) => {
  const needsNum2 = [
    "multiplication",
    "division",
    "fraction-to-decimal",
    "fraction-to-percent",
    "negative-numbers",
  ].includes(value.operation);

  if (needsNum2 && value.num2 === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["num2"],
      message: "num2 is required for this operation",
    });
  }
});

export const FeedbackSchema = z.object({
  type: z.enum(["feature", "bug"]),
  message: z.string().trim().min(1).max(2000),
});

const CreateRoomActionSchema = z.object({ action: z.literal("create-room"), odId: id, odName: requiredString });
const JoinRoomActionSchema = z.object({ action: z.literal("join-room"), roomCode: id, odId: id, odName: requiredString });
const LeaveRoomActionSchema = z.object({ action: z.literal("leave-room"), roomId: id, odId: id, odName: requiredString.optional() });
const QuickMatchActionSchema = z.object({ action: z.literal("quick-match"), odId: id, odName: requiredString.optional(), operation: OperationTypeSchema.optional() });
const SetReadyActionSchema = z.object({ action: z.literal("set-ready"), roomId: id, odId: id, isReady: z.boolean() });
const StartReadyPhaseActionSchema = z.object({ action: z.literal("start-ready-phase"), roomId: id, odId: id, settings: RoomSettingsSchema.optional() });
const UpdateRoomSettingsActionSchema = z.object({ action: z.literal("update-room-settings"), roomId: id, odId: id, settings: RoomSettingsSchema });
const StartGameActionSchema = z.object({ action: z.literal("start-game"), roomId: id, odId: id });
const UpdateProgressActionSchema = z.object({ action: z.literal("update-progress"), roomId: id, odId: id, currentQuestion: coerceInt(z.number().int().min(0)) });
const SubmitMultiplayerActionSchema = z.object({ action: z.literal("submit-multiplayer"), roomId: id, odId: id, answers: z.array(z.string()), score: coerceNumber() });
const RematchActionSchema = z.object({ action: z.literal("rematch"), roomId: id, odId: id, odName: requiredString, rematchAction: z.enum(["request", "accept", "decline"]), keepTeams: z.boolean().optional() });
const AssignTeamActionSchema = z.object({ action: z.literal("assign-team"), roomId: id, odId: id, targetPlayerId: id, teamId: id });
const CreateAIGameActionSchema = z.object({ action: z.literal("create-ai-game"), odId: id, odName: requiredString, aiDifficulty: z.enum(["easy", "medium", "hard", "expert"]), settings: RoomSettingsSchema.extend({ operation: OperationTypeSchema }) });
const PlayerDisconnectActionSchema = z.object({ action: z.literal("player-disconnect"), roomId: id, odId: id });

export const MultiplayerActionSchema = z.discriminatedUnion("action", [
  CreateRoomActionSchema,
  JoinRoomActionSchema,
  LeaveRoomActionSchema,
  QuickMatchActionSchema,
  SetReadyActionSchema,
  StartReadyPhaseActionSchema,
  UpdateRoomSettingsActionSchema,
  StartGameActionSchema,
  UpdateProgressActionSchema,
  SubmitMultiplayerActionSchema,
  RematchActionSchema,
  AssignTeamActionSchema,
  CreateAIGameActionSchema,
  PlayerDisconnectActionSchema,
]);

export type MultiplayerActionInput = z.infer<typeof MultiplayerActionSchema>;

export function validate<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(400, "Invalid request payload.", result.error.flatten());
  }
  return result.data;
}
