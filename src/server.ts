import "dotenv/config";
import cors from "cors";
import express from "express";
import mongoose, { InferSchemaType, Schema } from "mongoose";
import { z } from "zod";
import {
  invalidCredentialsResponse,
  validationErrorResponse
} from "./types/api-error.js";
import { loginSchema, registerSchema } from "./schemas/auth.js";

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

const commentSchema = new Schema(
  {
    author: { type: String, required: true, trim: true, maxlength: 30 },
    content: { type: String, required: true, trim: true, maxlength: 500 },
    createdAt: { type: Date, default: Date.now }
  },
  {
    _id: true,
    versionKey: false
  }
);

const postSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
    author: { type: String, required: true, trim: true, maxlength: 30 },
    viewCount: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    comments: { type: [commentSchema], default: [] }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

type PostDocument = InferSchemaType<typeof postSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  comments: Array<{
    _id: mongoose.Types.ObjectId;
    author: string;
    content: string;
    createdAt: Date;
  }>;
};

const PostModel = mongoose.model("Post", postSchema);

const createPostSchema = z.object({
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(1000),
  author: z.string().trim().min(1).max(30),
  expiryDays: z.coerce.number().int().min(1).max(30).default(defaultExpiryDays)
});

const createCommentSchema = z.object({
  author: z.string().trim().min(1).max(30),
  content: z.string().trim().min(1).max(500)
});

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000);

const serializePost = (post: PostDocument) => ({
  id: post._id.toString(),
  title: post.title,
  content: post.content,
  author: post.author,
  viewCount: post.viewCount,
  createdAt: post.createdAt.toISOString(),
  expiresAt: post.expiresAt.toISOString(),
  comments: post.comments.map((comment) => ({
    id: comment._id.toString(),
    author: comment.author,
    content: comment.content,
    createdAt: comment.createdAt.toISOString()
  })),
  commentCount: post.comments.length
});

const connectDatabase = async () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing. Add it to backend/.env.");
  }

  await mongoose.connect(databaseUrl);
};

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
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    service: "potatoland-backend",
    version: "0.1.0",
    timestamp: new Date().toISOString()
  });
});

app.get("/app/summary", (_request, response) => {
  response.json({
    project: "감자랜드",
    phase: "anonymous-board-mvp",
    database: "mongodb",
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

app.get("/posts", async (_request, response, next) => {
  try {
    const posts = await PostModel.find({ expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .lean<PostDocument[]>();

    response.json(posts.map(serializePost));
  } catch (error) {
    next(error);
  }
});

app.get("/posts/:id", async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      response.status(404).json({ message: "게시글을 찾을 수 없습니다." });
      return;
    }

    const post = await PostModel.findOneAndUpdate(
      { _id: request.params.id, expiresAt: { $gt: new Date() } },
      { $inc: { viewCount: 1 } },
      { new: true }
    ).lean<PostDocument | null>();

    if (!post) {
      response.status(404).json({ message: "게시글을 찾을 수 없습니다." });
      return;
    }

    response.json(serializePost(post));
  } catch (error) {
    next(error);
  }
});

app.post("/posts", async (request, response, next) => {
  try {
    const result = createPostSchema.safeParse(request.body);

    if (!result.success) {
      console.debug("post validation failed", result.error.flatten());
      response.status(400).json(validationErrorResponse);
      return;
    }

    const post = await PostModel.create({
      title: result.data.title,
      content: result.data.content,
      author: result.data.author,
      expiresAt: daysFromNow(result.data.expiryDays)
    });

    response.status(201).json(serializePost(post.toObject() as PostDocument));
  } catch (error) {
    next(error);
  }
});

app.post("/posts/:id/comments", async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      response.status(404).json({ message: "게시글을 찾을 수 없습니다." });
      return;
    }

    const result = createCommentSchema.safeParse(request.body);
    if (!result.success) {
      console.debug("comment validation failed", result.error.flatten());
      response.status(400).json(validationErrorResponse);
      return;
    }

    const comment = {
      _id: new mongoose.Types.ObjectId(),
      author: result.data.author,
      content: result.data.content,
      createdAt: new Date()
    };

    const post = await PostModel.findOneAndUpdate(
      { _id: request.params.id, expiresAt: { $gt: new Date() } },
      { $push: { comments: comment } },
      { new: true }
    ).lean<PostDocument | null>();

    if (!post) {
      response.status(404).json({ message: "게시글을 찾을 수 없습니다." });
      return;
    }

    response.status(201).json({
      id: comment._id.toString(),
      author: comment.author,
      content: comment.content,
      createdAt: comment.createdAt.toISOString()
    });
  } catch (error) {
    next(error);
  }
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

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled server error", error instanceof Error ? error.message : error);
    response.status(500).json({
      message: "서버 오류가 발생했습니다.",
      code: "INTERNAL_SERVER_ERROR"
    });
  }
);

const port = Number(process.env.PORT ?? 4000);

connectDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`API server listening on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error(
      "Failed to connect to MongoDB",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  });
