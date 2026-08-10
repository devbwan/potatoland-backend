# 감자랜드 Backend

Express backend for the anonymous 감자랜드 board.

## Product Notes

- Posts are created with an `expiryDays` value.
- Expired posts are hidden by the API and removed by MongoDB TTL on `expiresAt`.
- Comments are embedded under their post, so they are deleted together when the post expires.
- Direct user deletion is intentionally not exposed.
- Validation failures return `VALIDATION_ERROR`.

## Scripts

```powershell
npm install
npm run dev
```

The API runs on `http://127.0.0.1:4000` by default.

## Render

- Build Command: `npm install && npm run build`
- Start Command: `npm start` or `node dist/index.js`
- Environment Variable: `DATABASE_URL`

Useful local endpoints:

- `GET /health`
- `GET /app/summary`
- `GET /posts`
- `GET /posts/:id`
- `POST /posts`
- `POST /posts/:id/comments`
