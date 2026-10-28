import type { CatalogProduct, CatalogRetailer } from "./types"

export const localProducts: CatalogProduct[] = [
  { id: "gardenia-white-600g", name: "Gardenia Original Classic White Bread · 600 g", brand: "Gardenia", category: "bread", minCents: 150, maxCents: 600 },
  { id: "gardenia-wholemeal-400g", name: "Gardenia Fine Grain Wholemeal Bread · 400 g", brand: "Gardenia", category: "bread", minCents: 150, maxCents: 600 },
  { id: "meiji-fresh-milk-1l", name: "Meiji Fresh Milk · 1 L", brand: "Meiji", category: "milk", minCents: 180, maxCents: 550 },
  { id: "quaker-quick-oats-800g", name: "Quaker Quick Cook Oats · 800 g", brand: "Quaker", category: "cereal", minCents: 300, maxCents: 1500 },
]

export const localRetailers: CatalogRetailer[] = [
  { id: "fairprice", name: "FairPrice" },
  { id: "sheng-siong", name: "Sheng Siong" },
  { id: "cold-storage", name: "Cold Storage" },
  { id: "giant", name: "Giant" },
]
