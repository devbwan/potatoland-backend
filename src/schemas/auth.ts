import { z } from "zod";

export const pinSchema = z
  .string()
  .regex(/^\d{4}$/, "PIN은 숫자 4자리여야 합니다.");

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, "닉네임은 필수입니다.")
  .max(30, "닉네임은 최대 30자까지 가능합니다.");

export const registerSchema = z.object({
  nickname: nicknameSchema,
  pin: pinSchema
});

export const loginSchema = z.object({
  nickname: nicknameSchema,
  pin: pinSchema
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
