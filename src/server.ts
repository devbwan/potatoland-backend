import cors from "cors";
import express from "express";
import { z } from "zod";
import {
  invalidCredentialsResponse,
  validationErrorResponse
} from "./types/api-error.js";
import { loginSchema, registerSchema } from "./schemas/auth.js";

type Comment = {
  id: number;
  author: string;
  content: string;
  createdAt: string;
};

type Post = {
  id: number;
  title: string;
  content: string;
  author: string;
  viewCount: number;
  createdAt: string;
  expiresAt: string;
  comments: Comment[];
};

const app = express();
const allowedOrigins = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5174",
  "http://localhost:5174",
  "http://127.0.0.1:5175",
  "http://localhost:5175",
  "http://127.0.0.1:4173",
  "http://localhost:4173"
];
const defaultExpiryDays = 7;

const createPostSchema = z.object({
  title: z.string().min(1).max(80),
  content: z.string().min(1).max(1000),
  author: z.string().min(1).max(30),
  expiryDays: z.coerce.number().int().min(1).max(30).default(defaultExpiryDays)
});

const createCommentSchema = z.object({
  author: z.string().min(1).max(30),
  content: z.string().min(1).max(500)
});

const now = Date.now();
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const seededDaysFromNow = (days: number) => new Date(now + days * 86_400_000).toISOString();

let posts: Post[] = [
  {
    id: 1,
    title: "시험 망친 것 같아 너무 속상해 ㅠㅠ",
    content:
      "열심히 공부했다고 생각했는데 막상 결과를 보니까 생각만큼 안 나와서 너무 속상해요. 다들 이런 경험 있나요?",
    author: "익명 감자",
    viewCount: 124,
    createdAt: new Date(now - 3_600_000).toISOString(),
    expiresAt: seededDaysFromNow(6),
    comments: [
      {
        id: 101,
        author: "익명 감자",
        content: "나도 그랬어. 너무 자책하지 마. 이번 경험으로 더 성장할 수 있을 거야.",
        createdAt: new Date(now - 1_800_000).toISOString()
      },
      {
        id: 102,
        author: "익명 감자",
        content: "시간 지나면 괜찮아져. 맛있는 거 먹고 푹 쉬어.",
        createdAt: new Date(now - 1_200_000).toISOString()
      }
    ]
  },
  {
    id: 2,
    title: "오늘 날씨가 너무 좋다 :)",
    content: "점심 먹고 잠깐 산책했는데 하늘이 맑아서 기분이 좋아졌어요.",
    author: "익명 감자",
    viewCount: 85,
    createdAt: new Date(now - 7_200_000).toISOString(),
    expiresAt: seededDaysFromNow(6),
    comments: []
  },
  {
    id: 3,
    title: "처음 온 분들을 위한 안내",
    content:
      "감자랜드는 익명으로 글과 댓글을 남기는 게시판입니다. 글은 선택한 N일 뒤 자동 삭제되고 댓글도 함께 정리됩니다.",
    author: "익명 감자",
    viewCount: 210,
    createdAt: new Date(now - 10_800_000).toISOString(),
    expiresAt: seededDaysFromNow(7),
    comments: [
      {
        id: 301,
        author: "익명 감자",
        content: "댓글도 같이 삭제되는 점이 명확해서 좋아요.",
        createdAt: new Date(now - 5_400_000).toISOString()
      }
    ]
  }
];

const purgeExpiredPosts = () => {
  const currentTime = Date.now();
  posts = posts.filter((post) => new Date(post.expiresAt).getTime() > currentTime);
};

const serializePost = (post: Post) => ({
  ...post,
  commentCount: post.comments.length
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    }
  })
);
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "potatoland-backend",
    version: "0.1.0",
    timestamp: new Date().toISOString()
  });
});

app.get("/app/summary", (_request, response) => {
  response.json({
    project: "감자랜드",
    phase: "anonymous-board-mvp",
    nicknamePolicy: {
      requiredOnFirstVisit: true,
      storage: "session"
    },
    expirationPolicy: {
      label: "N일 뒤 자동 삭제",
      defaultDays: defaultExpiryDays,
      allowedDays: [1, 3, 7, 14, 30],
      comments: "게시글이 삭제되면 댓글도 함께 삭제됩니다."
    },
    contentPolicy: {
      rendering: "plain_text",
      htmlInput: false,
      markdown: false
    }
  });
});

app.get("/posts", (_request, response) => {
  purgeExpiredPosts();
  response.json(posts.map(serializePost));
});

app.get("/posts/:id", (request, response) => {
  purgeExpiredPosts();

  const post = posts.find((item) => item.id === Number(request.params.id));
  if (!post) {
    response.status(404).json({ message: "게시글을 찾을 수 없습니다." });
    return;
  }

  post.viewCount += 1;
  response.json(serializePost(post));
});

app.post("/posts", (request, response) => {
  purgeExpiredPosts();
  const result = createPostSchema.safeParse(request.body);

  if (!result.success) {
    console.debug("post validation failed", result.error.flatten());
    response.status(400).json(validationErrorResponse);
    return;
  }

  const post: Post = {
    id: Date.now(),
    title: result.data.title,
    content: result.data.content,
    author: result.data.author,
    viewCount: 0,
    createdAt: new Date().toISOString(),
    expiresAt: daysFromNow(result.data.expiryDays),
    comments: []
  };

  posts = [post, ...posts];
  response.status(201).json(serializePost(post));
});

app.post("/posts/:id/comments", (request, response) => {
  purgeExpiredPosts();
  const post = posts.find((item) => item.id === Number(request.params.id));

  if (!post) {
    response.status(404).json({ message: "게시글을 찾을 수 없습니다." });
    return;
  }

  const result = createCommentSchema.safeParse(request.body);
  if (!result.success) {
    console.debug("comment validation failed", result.error.flatten());
    response.status(400).json(validationErrorResponse);
    return;
  }

  const comment: Comment = {
    id: Date.now(),
    author: result.data.author,
    content: result.data.content,
    createdAt: new Date().toISOString()
  };

  post.comments = [...post.comments, comment];
  response.status(201).json(comment);
});

app.post("/auth/register", (request, response) => {
  const result = registerSchema.safeParse(request.body);

  if (!result.success) {
    console.debug("register validation failed", result.error.flatten());
    response.status(400).json(validationErrorResponse);
    return;
  }

  response.status(201).json({ message: "닉네임이 확인되었습니다." });
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

setInterval(purgeExpiredPosts, 60 * 60 * 1000);

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
