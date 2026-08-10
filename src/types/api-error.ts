export const apiErrorCodes = {
  validationError: "VALIDATION_ERROR",
  invalidCredentials: "INVALID_CREDENTIALS"
} as const;

export type ApiErrorCode = (typeof apiErrorCodes)[keyof typeof apiErrorCodes];

export type ApiErrorResponse = {
  message: string;
  code: ApiErrorCode;
};

export const validationErrorResponse: ApiErrorResponse = {
  message: "입력값이 올바르지 않습니다.",
  code: apiErrorCodes.validationError
};

export const invalidCredentialsResponse: ApiErrorResponse = {
  message: "닉네임 또는 PIN이 올바르지 않습니다.",
  code: apiErrorCodes.invalidCredentials
};
