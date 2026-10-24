const FRIENDLY_ERRORS: Record<string, string> = {
  NotAuthorizedException: "That email or password is not correct.",
  UserNotFoundException: "That email or password is not correct.",
  UserNotConfirmedException: "This account is not ready. Please contact support.",
  UsernameExistsException: "An account already exists for this email.",
  InvalidPasswordException: "Use at least 8 characters with uppercase, lowercase, a number, and a symbol.",
  ExpiredCodeException: "That code has expired. Request a new one.",
  LimitExceededException: "Too many attempts. Please wait a moment and try again.",
  NetworkError: "We could not reach the sign-in service. Check your connection and try again.",
}

export function getAuthErrorMessage(error: unknown) {
  if (error instanceof Error) return FRIENDLY_ERRORS[error.name] ?? error.message
  return "Something went wrong. Please try again."
}
