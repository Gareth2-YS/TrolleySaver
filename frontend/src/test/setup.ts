import "@testing-library/jest-dom/vitest"

Object.defineProperty(globalThis, "crypto", { value: { randomUUID: () => "test-id" } })
