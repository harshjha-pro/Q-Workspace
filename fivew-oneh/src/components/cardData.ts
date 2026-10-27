import { CATEGORY_MAP, INGREDIENT_MAP } from '../data';
import type { Product } from '../data/types';
import { formatINR } from './ui';

export { CATEGORY_MAP, INGREDIENT_MAP };

export function formatPrice(p: Product): string {
  if (!p.price) return 'Price not available';
  return `${formatINR(p.price.amount)}${p.price.verified ? '' : ' (illustrative)'}`;
}
