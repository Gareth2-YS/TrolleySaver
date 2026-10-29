/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_MODE?: "mock" | "cognito"
  readonly VITE_AWS_REGION?: string
  readonly VITE_COGNITO_USER_POOL_ID?: string
  readonly VITE_COGNITO_CLIENT_ID?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_SMART_BASKET_MODE?: "local" | "api"
  readonly VITE_PRICE_SUBMISSION_MODE?: "local" | "api"
}

interface ImportMeta { readonly env: ImportMetaEnv }
