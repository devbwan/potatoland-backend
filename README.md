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
