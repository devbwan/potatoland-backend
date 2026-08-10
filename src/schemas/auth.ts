import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(4, "비밀번호는 4자 이상이어야 합니다.")
  .max(100, "비밀번호는 100자 이하로 설정해야 합니다.");

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, "닉네임은 필수입니다.")
  .max(30, "닉네임은 최대 30자까지 가능합니다.");

export const registerSchema = z.object({
  nickname: nicknameSchema,
  password: passwordSchema
});

export const loginSchema = z.object({
  nickname: nicknameSchema,
  password: passwordSchema
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
