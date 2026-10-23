import "@testing-library/jest-dom/vitest"

Object.defineProperty(globalThis, "crypto", { value: { randomUUID: () => "test-id" } })
Object.defineProperty(URL, "createObjectURL", { value: () => "blob:test-image", writable: true })
Object.defineProperty(URL, "revokeObjectURL", { value: () => undefined, writable: true })
