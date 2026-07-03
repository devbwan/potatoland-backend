# Potatoland Backend

Express backend for Potatoland.

## Security Notes

- Password validation checks length only: 8 to 100 characters.
- Validation failures return `VALIDATION_ERROR`.
- Login failures return a single `INVALID_CREDENTIALS` response to avoid account enumeration.

## Scripts

```powershell
npm install
npm run dev
```

The API runs on `http://127.0.0.1:4000` by default.

Useful local endpoints:

- `GET /health`
- `GET /app/summary`
- `POST /auth/register`
- `POST /auth/login`
