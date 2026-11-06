import breadIcon from "../../assets/product-icons/Bread.svg"
import cerealIcon from "../../assets/product-icons/Cereal.svg"
import coffeeIcon from "../../assets/product-icons/Coffee.svg"
import cookieIcon from "../../assets/product-icons/Cookie.svg"
import detergentIcon from "../../assets/product-icons/Detergent.svg"
import eggIcon from "../../assets/product-icons/Egg.svg"
import milkIcon from "../../assets/product-icons/Milk.svg"
import paperIcon from "../../assets/product-icons/Paper.svg"
import riceIcon from "../../assets/product-icons/Rice.svg"
import softDrinkIcon from "../../assets/product-icons/Soft.svg"
import teaIcon from "../../assets/product-icons/Tea.svg"
import yogurtIcon from "../../assets/product-icons/Yogurt.svg"

// Shown in place of a product picture when a product has none, on every page.
const PRODUCT_CATEGORY_ICONS: Record<string, string> = {
  bread: breadIcon,
  cereal: cerealIcon,
  coffee: coffeeIcon,
  cookies: cookieIcon,
  detergent: detergentIcon,
  "laundry detergent": detergentIcon,
  eggs: eggIcon,
  milk: milkIcon,
  dairy: milkIcon,
  paper: paperIcon,
  "toilet rolls": paperIcon,
  rice: riceIcon,
  "soft drinks": softDrinkIcon,
  tea: teaIcon,
  yoghurt: yogurtIcon,
}

export function normalizeCategory(value: string) {
  return value.toLocaleLowerCase().replace(/[-_]/g, " ").trim()
}

export function getCategoryIcon(category?: string | null) {
  return category ? PRODUCT_CATEGORY_ICONS[normalizeCategory(category)] : undefined
}
