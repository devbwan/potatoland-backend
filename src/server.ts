import "dotenv/config";
import cors from "cors";
import express from "express";
import mongoose, { InferSchemaType, Schema } from "mongoose";
import { z } from "zod";
import {
  invalidCredentialsResponse,
  validationErrorResponse,
} from "./types/api-error.js";
import { loginSchema, nicknameSchema, registerSchema } from "./schemas/auth.js";

const app = express();
const allowedOrigins = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5174",
  "http://localhost:5174",
  "http://127.0.0.1:5175",
  "http://localhost:5175",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "https://potatoland.vercel.app",
  "https://potatoland-frontend.onrender.com",
];
const allowedOriginPatterns = [
  /^https:\/\/potatoland(?:-[a-z0-9-]+)*\.vercel\.app$/i,
];
const rootAdminNickname = "짱구";
const defaultExpiryDays = 3;
const maxExpiryDays = 7;

const commentSchema = new Schema(
  {
    author: { type: String, required: true, trim: true, maxlength: 30 },
    content: { type: String, required: true, trim: true, maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  },
  {
    _id: true,
    versionKey: false,
  },
);

const postSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
    author: { type: String, required: true, trim: true, maxlength: 30 },
    viewCount: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    comments: { type: [commentSchema], default: [] },
  },
  {
    timestamps: true,
    versionKey: false,
  },
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

const userSchema = new Schema(
  {
    nickname: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
      unique: true,
    },
    isAdmin: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

type UserDocument = InferSchemaType<typeof userSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

const UserModel = mongoose.model("User", userSchema);

const createPostSchema = z.object({
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(1000),
  author: z.string().trim().min(1).max(30),
  expiryDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(maxExpiryDays)
    .default(defaultExpiryDays),
});

const createCommentSchema = z.object({
  author: z.string().trim().min(1).max(30),
  content: z.string().trim().min(1).max(500),
});

const nicknameAvailabilitySchema = z.object({
  nickname: nicknameSchema,
});

const claimNicknameSchema = z.object({
  nickname: nicknameSchema,
});

const changeNicknameSchema = z
  .object({
    currentNickname: nicknameSchema,
    newNickname: nicknameSchema,
  })
  .refine((data) => data.currentNickname !== data.newNickname, {
    message: "현재 닉네임과 다른 닉네임을 입력해 주세요.",
    path: ["newNickname"],
  });

const requesterSchema = z.object({
  requester: nicknameSchema,
});

const adminGrantSchema = z.object({
  requester: nicknameSchema,
  isAdmin: z.boolean(),
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
    createdAt: comment.createdAt.toISOString(),
  })),
  commentCount: post.comments.length,
});

const serializeUser = (user: UserDocument) => ({
  id: user._id.toString(),
  nickname: user.nickname,
  isAdmin: user.isAdmin,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});

const nicknameExists = async (nickname: string) =>
  Boolean(
    (await UserModel.exists({ nickname })) ||
      (await PostModel.exists({
        expiresAt: { $gt: new Date() },
        $or: [{ author: nickname }, { "comments.author": nickname }],
      })),
  );

const ensureUser = async (nickname: string) => {
  const user = await UserModel.findOneAndUpdate(
    { nickname },
    {
      $set: { lastSeenAt: new Date() },
      $setOnInsert: {
        nickname,
        isAdmin: nickname === rootAdminNickname,
      },
    },
    { new: true, upsert: true },
  );

  return user;
};

const getRequesterAdmin = async (requester: string) => {
  const user = await ensureUser(requester);
  return user.isAdmin || user.nickname === rootAdminNickname;
};

const requireAdmin = async (
  requester: string,
  response: express.Response,
) => {
  const isAdmin = await getRequesterAdmin(requester);

  if (!isAdmin) {
    response.status(403).json({
      message: "운영자 권한이 필요합니다.",
      code: "ADMIN_REQUIRED",
    });
    return false;
  }

  return true;
};

const syncUsersFromContent = async () => {
  const [postAuthors, commentAuthors] = await Promise.all([
    PostModel.distinct("author", { expiresAt: { $gt: new Date() } }),
    PostModel.distinct("comments.author", { expiresAt: { $gt: new Date() } }),
  ]);
  const nicknames = Array.from(new Set([...postAuthors, ...commentAuthors])).filter(
    (nickname): nickname is string => typeof nickname === "string" && nickname.trim().length > 0,
  );

  await Promise.all(nicknames.map((nickname) => ensureUser(nickname)));
};

const isAllowedOrigin = (origin: string) => {
  const normalizedOrigin = origin.replace(/\/$/, "");
  return (
    allowedOrigins.includes(normalizedOrigin) ||
    allowedOriginPatterns.some((pattern) => pattern.test(normalizedOrigin))
  );
};

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
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      console.warn(`Blocked CORS origin: ${origin}`);
      callback(null, false);
    },
  }),
);
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    service: "potatoland-backend",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  });
});

app.get("/app/summary", (_request, response) => {
  response.json({
    project: "감자랜드",
    phase: "anonymous-board-mvp",
    database: "mongodb",
    nicknamePolicy: {
      requiredOnFirstVisit: true,
      storage: "session",
    },
    expirationPolicy: {
      label: "N일 뒤 자동 삭제",
      defaultDays: defaultExpiryDays,
      allowedDays: [1, 3, 7],
      comments: "게시글이 삭제되면 댓글도 함께 삭제됩니다.",
    },
    adminPolicy: {
      rootAdminNickname,
      permissions: ["delete_posts", "delete_comments", "grant_admin"],
    },
    contentPolicy: {
      rendering: "plain_text",
      htmlInput: false,
      markdown: false,
    },
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
      { new: true },
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
      expiresAt: daysFromNow(result.data.expiryDays),
    });
    await ensureUser(result.data.author);

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
      createdAt: new Date(),
    };
    await ensureUser(result.data.author);

    const post = await PostModel.findOneAndUpdate(
      { _id: request.params.id, expiresAt: { $gt: new Date() } },
      { $push: { comments: comment } },
      { new: true },
    ).lean<PostDocument | null>();

    if (!post) {
      response.status(404).json({ message: "게시글을 찾을 수 없습니다." });
      return;
    }

    response.status(201).json({
      id: comment._id.toString(),
      author: comment.author,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/posts/:id", async (request, response, next) => {
  try {
    const requesterResult = requesterSchema.safeParse(request.query);

    if (!requesterResult.success) {
      response.status(400).json(validationErrorResponse);
      return;
    }

    if (!(await requireAdmin(requesterResult.data.requester, response))) return;

    if (!mongoose.isValidObjectId(request.params.id)) {
      response.status(404).json({ message: "게시글을 찾을 수 없습니다." });
      return;
    }

    const deletedPost = await PostModel.findOneAndDelete({
      _id: request.params.id,
      expiresAt: { $gt: new Date() },
    });

    if (!deletedPost) {
      response.status(404).json({ message: "게시글을 찾을 수 없습니다." });
      return;
    }

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.delete("/posts/:postId/comments/:commentId", async (request, response, next) => {
  try {
    const requesterResult = requesterSchema.safeParse(request.query);

    if (!requesterResult.success) {
      response.status(400).json(validationErrorResponse);
      return;
    }

    if (!(await requireAdmin(requesterResult.data.requester, response))) return;

    if (
      !mongoose.isValidObjectId(request.params.postId) ||
      !mongoose.isValidObjectId(request.params.commentId)
    ) {
      response.status(404).json({ message: "댓글을 찾을 수 없습니다." });
      return;
    }

    const post = await PostModel.findOneAndUpdate(
      {
        _id: request.params.postId,
        "comments._id": request.params.commentId,
        expiresAt: { $gt: new Date() },
      },
      { $pull: { comments: { _id: request.params.commentId } } },
      { new: true },
    ).lean<PostDocument | null>();

    if (!post) {
      response.status(404).json({ message: "댓글을 찾을 수 없습니다." });
      return;
    }

    response.json(serializePost(post));
  } catch (error) {
    next(error);
  }
});

app.post("/nicknames/availability", async (request, response, next) => {
  try {
    const result = nicknameAvailabilitySchema.safeParse(request.body);

    if (!result.success) {
      console.debug(
        "nickname availability validation failed",
        result.error.flatten(),
      );
      response.status(400).json(validationErrorResponse);
      return;
    }

    const isTaken = await nicknameExists(result.data.nickname);
    response.json({ available: !isTaken });
  } catch (error) {
    next(error);
  }
});

app.post("/nicknames/claim", async (request, response, next) => {
  try {
    const result = claimNicknameSchema.safeParse(request.body);

    if (!result.success) {
      console.debug("nickname claim validation failed", result.error.flatten());
      response.status(400).json(validationErrorResponse);
      return;
    }

    const isTaken = await nicknameExists(result.data.nickname);

    if (isTaken) {
      response.status(409).json({
        message: "이미 사용 중인 닉네임입니다.",
        code: "NICKNAME_ALREADY_EXISTS",
      });
      return;
    }

    const user = await UserModel.create({
      nickname: result.data.nickname,
      isAdmin: result.data.nickname === rootAdminNickname,
      lastSeenAt: new Date(),
    });

    response.status(201).json(serializeUser(user));
  } catch (error) {
    next(error);
  }
});

app.get("/nicknames/profile", async (request, response, next) => {
  try {
    const result = nicknameAvailabilitySchema.safeParse(request.query);

    if (!result.success) {
      response.status(400).json(validationErrorResponse);
      return;
    }

    const user = await ensureUser(result.data.nickname);
    response.json(serializeUser(user));
  } catch (error) {
    next(error);
  }
});

app.patch("/nicknames", async (request, response, next) => {
  try {
    const result = changeNicknameSchema.safeParse(request.body);

    if (!result.success) {
      console.debug(
        "nickname change validation failed",
        result.error.flatten(),
      );
      response.status(400).json(validationErrorResponse);
      return;
    }

    const { currentNickname, newNickname } = result.data;
    const isTaken = await nicknameExists(newNickname);

    if (isTaken) {
      response.status(409).json({
        message: "이미 사용 중인 닉네임입니다.",
        code: "NICKNAME_ALREADY_EXISTS",
      });
      return;
    }

    const postUpdate = await PostModel.updateMany(
      { author: currentNickname, expiresAt: { $gt: new Date() } },
      { $set: { author: newNickname } },
    );
    const commentUpdate = await PostModel.updateMany(
      { "comments.author": currentNickname, expiresAt: { $gt: new Date() } },
      { $set: { "comments.$[comment].author": newNickname } },
      { arrayFilters: [{ "comment.author": currentNickname }] },
    );
    const existingUser = await UserModel.findOne({ nickname: currentNickname });
    const nextIsAdmin =
      newNickname === rootAdminNickname ? true : (existingUser?.isAdmin ?? false);
    const user = await UserModel.findOneAndUpdate(
      { nickname: currentNickname },
      {
        $set: {
          nickname: newNickname,
          isAdmin: nextIsAdmin,
          lastSeenAt: new Date(),
        },
      },
      { new: true, upsert: true },
    );

    response.json({
      nickname: newNickname,
      isAdmin: user.isAdmin || user.nickname === rootAdminNickname,
      updatedPosts: postUpdate.modifiedCount,
      updatedCommentThreads: commentUpdate.modifiedCount,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/users", async (request, response, next) => {
  try {
    const requesterResult = requesterSchema.safeParse(request.query);

    if (!requesterResult.success) {
      response.status(400).json(validationErrorResponse);
      return;
    }

    if (!(await requireAdmin(requesterResult.data.requester, response))) return;

    await syncUsersFromContent();
    const users = await UserModel.find().sort({ isAdmin: -1, nickname: 1 });
    response.json(users.map(serializeUser));
  } catch (error) {
    next(error);
  }
});

app.patch("/users/:nickname/admin", async (request, response, next) => {
  try {
    const result = adminGrantSchema.safeParse(request.body);

    if (!result.success) {
      console.debug("admin grant validation failed", result.error.flatten());
      response.status(400).json(validationErrorResponse);
      return;
    }

    if (!(await requireAdmin(result.data.requester, response))) return;

    const targetNickname = decodeURIComponent(request.params.nickname);

    if (targetNickname === rootAdminNickname && !result.data.isAdmin) {
      response.status(400).json({
        message: "기본 운영자 권한은 해제할 수 없습니다.",
        code: "ROOT_ADMIN_REQUIRED",
      });
      return;
    }

    const user = await UserModel.findOneAndUpdate(
      { nickname: targetNickname },
      {
        $set: {
          isAdmin: result.data.isAdmin || targetNickname === rootAdminNickname,
          lastSeenAt: new Date(),
        },
        $setOnInsert: {
          nickname: targetNickname,
        },
      },
      { new: true, upsert: true },
    );

    response.json(serializeUser(user));
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
    _next: express.NextFunction,
  ) => {
    console.error(
      "Unhandled server error",
      error instanceof Error ? error.message : error,
    );
    response.status(500).json({
      message: "서버 오류가 발생했습니다.",
      code: "INTERNAL_SERVER_ERROR",
    });
  },
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
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
