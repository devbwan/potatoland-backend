import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "비밀번호는 8자 이상이어야 합니다.")
  .max(100, "비밀번호는 100자 이하로 설정해야 합니다.");

export const registerSchema = z.object({
  email: z.string().email("올바른 이메일 형식이 아닙니다."),
  nickname: z
    .string()
    .min(1, "닉네임은 필수입니다.")
    .max(30, "닉네임은 최대 30자까지 가능합니다."),
  password: passwordSchema
});

export const loginSchema = z.object({
  email: z.string().email("올바른 이메일 형식이 아닙니다."),
  password: passwordSchema
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
