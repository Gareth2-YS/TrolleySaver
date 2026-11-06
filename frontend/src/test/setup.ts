import "@testing-library/jest-dom/vitest"
import { configure } from "@testing-library/react"

// findBy*/waitFor give up after 1 s by default, which a busy machine or CI runner can exceed.
configure({ asyncUtilTimeout: 5000 })

Object.defineProperty(globalThis, "crypto", { value: { randomUUID: () => "test-id" } })
Object.defineProperty(URL, "createObjectURL", { value: () => "blob:test-image", writable: true })
Object.defineProperty(URL, "revokeObjectURL", { value: () => undefined, writable: true })

Object.defineProperty(HTMLDialogElement.prototype, "showModal", { value: function () { this.open = true } })
Object.defineProperty(HTMLDialogElement.prototype, "close", { value: function () { this.open = false; this.dispatchEvent(new Event("close")) } })
