import "@testing-library/jest-dom/vitest"

Object.defineProperty(globalThis, "crypto", { value: { randomUUID: () => "test-id" } })
Object.defineProperty(URL, "createObjectURL", { value: () => "blob:test-image", writable: true })
Object.defineProperty(URL, "revokeObjectURL", { value: () => undefined, writable: true })

Object.defineProperty(HTMLDialogElement.prototype, "showModal", { value: function () { this.open = true } })
Object.defineProperty(HTMLDialogElement.prototype, "close", { value: function () { this.open = false; this.dispatchEvent(new Event("close")) } })
