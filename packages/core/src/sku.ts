/**
 * SKU scheme `ROS-{CAT}-{NNNN}-{COLOR}-{SIZE}`, e.g. `ROS-KIS-0012-SAN-4545`.
 * Missing color or size segments are omitted. SKUs never change once created.
 */

export class SkuError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkuError';
  }
}

const CODE = /^[A-Z]{3}$/;

function code(value: string, field: string): string {
  const normalized = value.trim().toUpperCase();
  if (!CODE.test(normalized)) {
    throw new SkuError(`${field} muss aus genau drei Buchstaben bestehen, erhalten: "${value}"`);
  }
  return normalized;
}

/**
 * Size segment: uppercase letters and digits only; dimension separators
 * between numbers are dropped ("45×45" → "4545", "40 x 150" → "40150").
 */
export function skuSize(size: string | null | undefined): string | null {
  if (size === null || size === undefined || size.trim() === '') return null;
  const segment = size
    .replace(/(\d)\s*[x×*]\s*(?=\d)/gi, '$1')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (segment === '') {
    throw new SkuError(`Die Größe "${size}" enthält keine Buchstaben oder Ziffern für die SKU.`);
  }
  return segment;
}

export function buildSku(parts: {
  categoryCode: string;
  productNumber: number;
  colorCode?: string | null;
  size?: string | null;
}): string {
  const { categoryCode, productNumber, colorCode, size } = parts;
  if (!Number.isInteger(productNumber) || productNumber < 1 || productNumber > 9999) {
    throw new SkuError(`Produktnummer muss zwischen 1 und 9999 liegen, erhalten: ${String(productNumber)}`);
  }

  const segments = ['ROS', code(categoryCode, 'Kategorie-Kürzel'), String(productNumber).padStart(4, '0')];
  if (colorCode) segments.push(code(colorCode, 'Farb-Kürzel'));
  const sizeSegment = skuSize(size);
  if (sizeSegment) segments.push(sizeSegment);
  return segments.join('-');
}

/** Display name of a variant, built from color and size. */
export function buildVariantLabel(
  colorName: string | null | undefined,
  size: string | null | undefined,
): string {
  const parts = [colorName?.trim(), size?.trim()].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' ') : 'Standard';
}
