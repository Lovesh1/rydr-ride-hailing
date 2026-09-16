// Ryder design system — warm porcelain light theme, emerald + gold accents
export const C = {
  bg: '#F6F4EF',          // warm porcelain
  surface: '#FFFFFF',
  sand: '#F0EAE0',
  mint: '#E3F2EA',
  mintDeep: '#CBE8D9',
  ink: '#182420',          // deep pine ink
  inkSoft: '#3C4A44',
  mut: '#79857F',
  hair: '#E8E3D9',
  hairDark: '#D8D2C4',
  emerald: '#0B8457',
  emeraldDark: '#06603E',
  gold: '#AE8A4A',
  goldSoft: '#F3EAD7',
  red: '#CE5A4E',
  redSoft: '#FBEAE7',
  amber: '#D99E3B',
  amberSoft: '#FAF0DC',
  violet: '#7D6BD1',
  violetSoft: '#EEEBFA',
  white: '#FFFFFF',
};

export const R = { lg: 26, md: 18, sm: 12, pill: 999 };

export const F = {
  ui: 'Manrope_500Medium',
  uiSemi: 'Manrope_600SemiBold',
  uiBold: 'Manrope_700Bold',
  uiHeavy: 'Manrope_800ExtraBold',
  serif: 'Fraunces_500Medium_Italic',
};

export const shadow = {
  card: {
    shadowColor: '#1A2420', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07, shadowRadius: 22, elevation: 4,
  },
  float: {
    shadowColor: '#1A2420', shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.13, shadowRadius: 32, elevation: 9,
  },
};

export const CATEGORY_META = {
  bike:  { emoji: '🏍', tint: '#EAF3EC' },
  auto:  { emoji: '🛺', tint: '#F6EEDC' },
  mini:  { emoji: '🚗', tint: '#E9EFF7' },
  prime: { emoji: '🚘', tint: '#F0EBF9' },
  suv:   { emoji: '🚙', tint: '#F7ECE7' },
  ev:    { emoji: '⚡', tint: '#E4F4EE' },
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
