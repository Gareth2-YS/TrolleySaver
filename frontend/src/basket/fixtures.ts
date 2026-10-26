// DEVELOPMENT ONLY. Used by LocalBasketService when VITE_SMART_BASKET_MODE=local; never shipped as real prices.
// Regular shelf prices copied from data/products 241026.xlsx; rows marked sold_out there are left unpriced.
import type { PriceTable } from "./compare"
import type { Product, Retailer } from "./types"

export const localRetailers: Retailer[] = [
  { id: "coldstorage", name: "Cold Storage" },
  { id: "fairprice", name: "FairPrice" },
  { id: "shengsiong", name: "Sheng Siong" },
]

const rows: [Product, fairprice: number | null, shengsiong: number | null, coldstorage: number | null][] = [
  [{ id: "local-coke-zero", name: "Coca-Cola Mini Can Drink - Zero Sugar", brand: "Coca-Cola", category: "soft drinks", packQty: 180, packUnit: "ml", packCount: 6, hcs: true }, 525, 525, 550],
  [{ id: "local-coke-classic", name: "Coca-Cola Mini Classic", brand: "Coca-Cola", category: "soft drinks", packQty: 180, packUnit: "ml", packCount: 6, hcs: false }, 525, 525, 550],
  [{ id: "local-wholemeal-bread", name: "Gardenia 100% Wholemeal Extra Soft & Fine Bread", brand: "Gardenia", category: "bread", packQty: 400, packUnit: "g", hcs: true }, 330, 330, null],
  [{ id: "local-white-bread", name: "Gardenia Enriched White Bread", brand: "Gardenia", category: "bread", packQty: 400, packUnit: "g", hcs: false }, 250, 250, 250],
  [{ id: "local-milo-cereal", name: "Nestlé MILO Cereal Economic Pack", brand: "Nestlé", category: "cereal", packQty: 300, packUnit: "g", hcs: true }, 646, 640, 645],
  [{ id: "local-coco-pops", name: "Kellogg's Coco Pops", brand: "Kellogg's", category: "cereal", packQty: 350, packUnit: "g", hcs: false }, 770, 770, 770],
  [{ id: "local-kopi-o-kosong", name: "Owl Kopitiam Roast & Ground Coffee Bags - Kopi-O Kosong", brand: "Owl", category: "coffee", packQty: 10, packUnit: "g", packCount: 20, hcs: true }, null, 735, 755],
  [{ id: "local-top-detergent", name: "Top Concentrated Liquid Detergent Bottle - Super White", brand: "Top", category: "detergent", packQty: 2.6, packUnit: "kg", hcs: false }, 848, 847, 860],
  [{ id: "local-dynamo-detergent", name: "Dynamo Laundry Detergent - Anti-Bacterial", brand: "Dynamo", category: "detergent", packQty: 2.5, packUnit: "kg", hcs: false }, 1590, 1390, 1990],
  [{ id: "local-marigold-yoghurt", name: "Marigold Non Fat Yoghurt - Natural", brand: "Marigold", category: "yoghurt", packQty: 1, packUnit: "kg", hcs: true }, 732, 732, 745],
  [{ id: "local-farmers-union-yogurt", name: "Farmers Union Greek Style Natural Yogurt", brand: "Farmers Union", category: "yoghurt", packQty: 1, packUnit: "kg", hcs: false }, 1170, 1170, 1210],
  [{ id: "local-thai-rice", name: "SongHe AAA Thai Hom Mali Rice", brand: "Songhe", category: "rice", packQty: 5, packUnit: "kg", hcs: false }, 1880, 1860, 1880],
  [{ id: "local-brown-rice", name: "Songhe Noble Brown Rice", brand: "Songhe", category: "rice", packQty: 5, packUnit: "kg", hcs: true }, 1885, 1884, 1980],
  [{ id: "local-oat-krunch", name: "Munchy's Oat Krunch Crackers - Strawberry & Blackcurrant", brand: "Munchy's", category: "cookies", packQty: 26, packUnit: "g", packCount: 8, hcs: true }, 378, 378, 380],
]

export const localProducts: Product[] = rows.map(([product]) => product).sort((a, b) => a.name.localeCompare(b.name))

const observedAt = "2026-10-24T08:00:00.000Z"

export const localPrices: PriceTable = Object.fromEntries(rows.map(([product, fairprice, shengsiong, coldstorage]) => [
  product.id,
  Object.fromEntries(
    ([["fairprice", fairprice], ["shengsiong", shengsiong], ["coldstorage", coldstorage]] as const)
      .filter(([, cents]) => cents !== null)
      .map(([retailerId, cents]) => [retailerId, { priceCents: cents!, observedAt }]),
  ),
]))
