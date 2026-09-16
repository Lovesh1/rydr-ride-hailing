// Ryder design system v4 — "Volt on Ink"
// Built from the researched playbook: 60/30/10 color (one electric accent doing
// all the work), cool near-white base, white bento cards, near-black ink type,
// pastel category tiles, chunky high-contrast CTAs. No serif flourishes.
// NOTE: key names are semantic-legacy (emerald/gold/mint/...) so every screen
// reskins from here without edits — values define the new language.
export const C = {
  bg: '#F5F7FA',          // cool near-white canvas
  surface: '#FFFFFF',
  sand: '#EDF1F6',        // neutral chip / input tint
  mint: '#EBEDFF',        // accent-soft (selected states)
  mintDeep: '#C9CEFF',    // accent-soft border
  ink: '#0E1116',         // near-black
  inkSoft: '#3A424C',
  mut: '#69737F',         // calm gray body
  hair: '#E4E8EF',
  hairDark: '#D2D8E2',
  emerald: '#4353FF',     // ★ the accent: electric ultramarine
  emeraldDark: '#2E3BD3',
  gold: '#FF7A1A',        // secondary pop: tangerine (highlights, stars, OTP)
  goldSoft: '#FFF1E4',
  red: '#F4485D',
  redSoft: '#FEEBEE',
  amber: '#E9A200',
  amberSoft: '#FFF6DE',
  violet: '#8B5CF6',
  violetSoft: '#F1EBFE',
  white: '#FFFFFF',
};

export const R = { lg: 28, md: 18, sm: 12, pill: 999 };

export const F = {
  ui: 'Manrope_500Medium',
  uiSemi: 'Manrope_600SemiBold',
  uiBold: 'Manrope_700Bold',
  uiHeavy: 'Manrope_800ExtraBold',
  serif: 'Manrope_800ExtraBold',   // serif retired — accent text is bold sans now
};

export const shadow = {
  card: {
    shadowColor: '#101828', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06, shadowRadius: 16, elevation: 3,
  },
  float: {
    shadowColor: '#101828', shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14, shadowRadius: 32, elevation: 10,
  },
};

/* pastel bento tints per category — soft field + deep icon color */
export const CATEGORY_META = {
  bike:  { emoji: '🏍', tint: '#E1F6E9', deep: '#0E9F5D' },
  auto:  { emoji: '🛺', tint: '#FFF1DC', deep: '#D97706' },
  mini:  { emoji: '🚗', tint: '#E3EEFF', deep: '#2563EB' },
  prime: { emoji: '🚘', tint: '#F1EBFE', deep: '#7C3AED' },
  suv:   { emoji: '🚙', tint: '#FDE8EC', deep: '#DB2777' },
  ev:    { emoji: '⚡', tint: '#E0F7F4', deep: '#0D9488' },
};

export const inr = (n) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export const timeAgo = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export const timeAt = (ts) =>
  new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
