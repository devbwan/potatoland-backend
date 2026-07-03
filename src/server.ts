import express from "express";
import {
  invalidCredentialsResponse,
  validationErrorResponse
} from "./types/api-error.js";
import { loginSchema, registerSchema } from "./schemas/auth.js";

const app = express();

app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/auth/register", (request, response) => {
  const result = registerSchema.safeParse(request.body);

  if (!result.success) {
    console.debug("register validation failed", result.error.flatten());
    response.status(400).json(validationErrorResponse);
    return;
  }

  response.status(201).json({ message: "회원가입 요청이 검증되었습니다." });
});

app.post("/auth/login", (request, response) => {
  const result = loginSchema.safeParse(request.body);

  if (!result.success) {
    console.debug("login validation failed", result.error.flatten());
    response.status(400).json(validationErrorResponse);
    return;
  }

  response.status(401).json(invalidCredentialsResponse);
});

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
