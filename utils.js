/** Shared utility functions */

export const fmt = (n) =>
  '$' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export function productEmoji(p) {
  const t = (p?.title || '').toLowerCase();
  const type = (p?.product_type || '').toLowerCase();
  if (t.includes('iphone')) return '📱';
  if (t.includes('galaxy s') || (t.includes('galaxy') && type === 'device')) return '📱';
  if (t.includes('pixel') && type === 'device') return '📱';
  if (t.includes('airpod') || t.includes('buds')) return '🎧';
  if (t.includes('watch')) return '⌚';
  if (t.includes('case')) return '🛡️';
  if (t.includes('charger') || t.includes('magsafe')) return '⚡';
  if (t.includes('pencil') || t.includes('pen')) return '✏️';
  if (t.includes('cable') || t.includes('wire')) return '🔌';
  if (t.includes('screen') || t.includes('glass')) return '🔲';
  if (t.includes('band') || t.includes('strap')) return '🔗';
  if (type === 'accessory') return '🔌';
  return '📦';
}

export function cardBrandEmoji(brand = '') {
  switch (brand.toLowerCase()) {
    case 'visa': return '💳';
    case 'mastercard': return '💳';
    case 'amex': return '💳';
    default: return '💳';
  }
}

export function brandColor(brand = '') {
  const b = brand.toLowerCase();
  if (b === 'apple')   return '#a0a0a8';
  if (b === 'samsung') return '#1428a0';
  if (b === 'google')  return '#4285f4';
  return 'var(--muted)';
}

export function taxRate(state = '') {
  const rates = {
    VA: 0.053, CA: 0.0725, NY: 0.08, TX: 0.0625,
    FL: 0.06,  WA: 0.065,  OR: 0.00, MT: 0.00,
    NV: 0.0685, AZ: 0.056,
  };
  return rates[state.toUpperCase().trim()] ?? 0.08;
}
