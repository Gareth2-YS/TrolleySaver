import { useCallback, useState, type SetStateAction } from "react"
import { useAuth } from "../auth/auth-context"
import { loadBasket, saveBasket } from "./service"
import type { BasketItem } from "./types"

const MAX_QUANTITY = 99

// Adds `extra` on top of `items`, summing lines for the same product.
function mergeItems(items: BasketItem[], extra: BasketItem[]) {
  const merged = items.map((item) => ({ ...item }))
  for (const line of extra) {
    const existing = merged.find((item) => item.productId === line.productId)
    if (existing) existing.quantity = Math.min(existing.quantity + line.quantity, MAX_QUANTITY)
    else merged.push({ ...line })
  }
  return merged
}

export type BasketItems = ReturnType<typeof useBasketItems>

// The basket of whoever is signed in, or the signed-out basket. While the session is still being
// restored there is no owner yet: edits made then are kept and added to the owner's saved basket
// once it is known, and `save` does nothing until then.
export function useBasketItems() {
  const { user, loading } = useAuth()
  const owner = loading ? undefined : user?.id ?? null
  const [state, setState] = useState(() => ({ owner, items: owner === undefined ? [] : loadBasket(owner), generation: 0 }))

  // Signing in or out swaps in that account's basket during the same render, so the old
  // account's items are never shown or saved under the new one. `generation` counts those
  // switches (not the first restore), so pages can start afresh for each account.
  let current = state
  if (state.owner !== owner) {
    const restoring = state.owner === undefined
    current = {
      owner,
      items: owner === undefined ? [] : restoring ? mergeItems(loadBasket(owner), state.items) : loadBasket(owner),
      generation: restoring ? state.generation : state.generation + 1,
    }
    setState(current)
  }

  const setItems = useCallback((update: SetStateAction<BasketItem[]>) => {
    setState((previous) => ({ ...previous, items: typeof update === "function" ? update(previous.items) : update }))
  }, [])

  const save = useCallback((items: BasketItem[]) => {
    if (current.owner !== undefined) saveBasket(items, current.owner)
  }, [current.owner])

  return { items: current.items, setItems, save, owner: current.owner, generation: current.generation }
}
