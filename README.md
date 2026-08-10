# 감자랜드 Backend

Express backend for the anonymous 감자랜드 board.

## Product Notes

- Posts are created with an `expiryDays` value.
- The API hides expired posts and periodically purges them.
- Comments are embedded under their post, so they are deleted together when the post expires.
- Direct user deletion is intentionally not exposed.
- Validation failures return `VALIDATION_ERROR`.

## Scripts

```powershell
npm install
npm run dev
```

The API runs on `http://127.0.0.1:4000` by default.

Useful local endpoints:

- `GET /health`
- `GET /app/summary`
- `GET /posts`
- `GET /posts/:id`
- `POST /posts`
- `POST /posts/:id/comments`
