import { z } from "zod";

export const ALLOWED_OPERATIONS = [
  "multiplication",
  "division",
  "squares",
  "square-roots",
  "fraction-to-decimal",
  "decimal-to-fraction",
  "fraction-to-percent",
  "percent-to-fraction",
  "negative-numbers",
] as const;

export const OperationTypeSchema = z.enum(ALLOWED_OPERATIONS);
export type OperationType = z.infer<typeof OperationTypeSchema>;
export const ALLOWED_OPERATION_SET = new Set<string>(ALLOWED_OPERATIONS);
