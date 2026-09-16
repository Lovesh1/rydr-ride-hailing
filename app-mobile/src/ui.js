// Shared UI kit — light premium components
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Animated, Easing,
} from 'react-native';
import { C, R, F, shadow } from './theme';

export const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { paddingHorizontal: 22 },
  card: {
    backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1,
    borderColor: C.hair, ...shadow.card,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  h1: { fontFamily: F.uiHeavy, fontSize: 34, color: C.ink, letterSpacing: -1.2 },
  h2: { fontFamily: F.uiHeavy, fontSize: 23, color: C.ink, letterSpacing: -0.6 },
  h3: { fontFamily: F.uiBold, fontSize: 16, color: C.ink, letterSpacing: -0.2 },
  serif: { fontFamily: F.uiHeavy, color: C.emerald },
  body: { fontFamily: F.uiSemi, fontSize: 14, color: C.inkSoft, lineHeight: 21 },
  mut: { fontFamily: F.uiSemi, fontSize: 12.5, color: C.mut },
  micro: {
    fontFamily: F.uiHeavy, fontSize: 10.5, color: C.mut,
    letterSpacing: 1.8, textTransform: 'uppercase',
  },
});

export function Micro({ children, color, style }) {
  return <Text style={[S.micro, color && { color }, style]}>{children}</Text>;
}

export function Btn({ title, onPress, kind = 'primary', style, disabled, small }) {
  const kinds = {
    primary: { bg: C.emerald, fg: C.white, bd: C.emerald },
    dark: { bg: C.ink, fg: C.white, bd: C.ink },
    gold: { bg: C.gold, fg: C.white, bd: C.gold },
    soft: { bg: C.mint, fg: C.emeraldDark, bd: C.mint },
    ghost: { bg: C.surface, fg: C.inkSoft, bd: C.hairDark },
    danger: { bg: C.redSoft, fg: C.red, bd: C.redSoft },
  };
  const k = kinds[kind] || kinds.primary;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPress={onPress}
      style={[{
        backgroundColor: k.bg, borderWidth: 1.5, borderColor: k.bd,
        borderRadius: R.pill, paddingVertical: small ? 11 : 17,
        paddingHorizontal: small ? 18 : 26, alignItems: 'center',
        opacity: disabled ? 0.45 : 1,
      }, (kind === 'primary' || kind === 'dark') && shadow.card, style]}
    >
      <Text style={{ fontFamily: F.uiHeavy, fontSize: small ? 12.5 : 15.5, color: k.fg, letterSpacing: 0.1 }}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

export function Pill({ text, tone = 'mut', style }) {
  const tones = {
    em: { bg: C.mint, fg: C.emeraldDark, bd: C.mintDeep },
    gold: { bg: C.goldSoft, fg: C.gold, bd: '#E8DCC0' },
    red: { bg: C.redSoft, fg: C.red, bd: '#F0CFC9' },
    amber: { bg: C.amberSoft, fg: '#A87A20', bd: '#EEDDBB' },
    vi: { bg: C.violetSoft, fg: C.violet, bd: '#DCD6F2' },
    mut: { bg: C.sand, fg: C.mut, bd: C.hairDark },
  };
  const t = tones[tone] || tones.mut;
  return (
    <View style={[{
      backgroundColor: t.bg, borderWidth: 1, borderColor: t.bd,
      borderRadius: R.pill, paddingVertical: 5, paddingHorizontal: 12, alignSelf: 'flex-start',
    }, style]}>
      <Text style={{ fontFamily: F.uiBold, fontSize: 10.5, color: t.fg, letterSpacing: 0.8 }}>{text}</Text>
    </View>
  );
}

export function Input(props) {
  return (
    <TextInput
      placeholderTextColor={C.mut}
      {...props}
      style={[{
        backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.hair,
        borderRadius: R.md, paddingVertical: 15, paddingHorizontal: 18,
        fontFamily: F.uiSemi, fontSize: 15, color: C.ink,
      }, props.style]}
    />
  );
}

/* ---------- toast ---------- */
let toastFn = null;
export function toast(msg, isErr = false) { if (toastFn) toastFn(msg, isErr); }
export function ToastHost() {
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(false);
  const op = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);
  useEffect(() => {
    toastFn = (m, e) => {
      setMsg(m); setErr(!!e);
      Animated.timing(op, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      clearTimeout(timer.current);
      timer.current = setTimeout(() =>
        Animated.timing(op, { toValue: 0, duration: 260, useNativeDriver: true }).start(), 2400);
    };
    return () => { toastFn = null; };
  }, []);
  if (!msg) return null;
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', bottom: 104, left: 24, right: 24, opacity: op,
      backgroundColor: err ? '#3A211D' : C.ink, borderRadius: 16,
      paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', ...shadow.float, zIndex: 999,
    }}>
      <Text style={{ fontFamily: F.uiSemi, fontSize: 13.5, color: err ? '#F5C8C0' : '#F3F1EA', textAlign: 'center' }}>
        {msg}
      </Text>
    </Animated.View>
  );
}

/* ---------- stylised light map ---------- */
export function makeProjection(points, pad = 0.16) {
  const lats = points.map(p => p.lat), lngs = points.map(p => p.lng);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const dLat = Math.max(maxLat - minLat, 0.01), dLng = Math.max(maxLng - minLng, 0.01);
  minLat -= dLat * pad; maxLat += dLat * pad; minLng -= dLng * pad; maxLng += dLng * pad;
  return (lat, lng) => ({
    x: ((lng - minLng) / (maxLng - minLng)) * 100,
    y: (1 - (lat - minLat) / (maxLat - minLat)) * 100,
  });
}

export function MapCanvas({ height = 240, children, style }) {
  const lines = [];
  for (let i = 1; i < 8; i++) {
    lines.push(<View key={'h' + i} style={{ position: 'absolute', left: 0, right: 0, top: `${i * 12.5}%`, height: 1, backgroundColor: '#1824200A' }} />);
    lines.push(<View key={'v' + i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${i * 12.5}%`, width: 1, backgroundColor: '#1824200A' }} />);
  }
  return (
    <View style={[{
      height, borderRadius: R.lg, overflow: 'hidden',
      backgroundColor: '#E9EEF5', borderWidth: 1, borderColor: C.hair,
    }, style]}>
      <View style={{ position: 'absolute', width: '55%', height: '55%', borderRadius: 999, backgroundColor: '#4353FF0F', top: '-12%', left: '-10%' }} />
      <View style={{ position: 'absolute', width: '45%', height: '45%', borderRadius: 999, backgroundColor: '#FF7A1A0C', bottom: '-8%', right: '-6%' }} />
      {lines}
      <View style={{ position: 'absolute', left: '-10%', right: '-10%', top: '38%', height: 10, backgroundColor: '#FFFFFF', transform: [{ rotate: '-9deg' }], borderRadius: 6 }} />
      <View style={{ position: 'absolute', left: '-10%', right: '-10%', top: '66%', height: 7, backgroundColor: '#FFFFFF', transform: [{ rotate: '14deg' }], borderRadius: 6 }} />
      <View style={{ position: 'absolute', top: '-10%', bottom: '-10%', left: '30%', width: 7, backgroundColor: '#FFFFFF', transform: [{ rotate: '8deg' }], borderRadius: 6 }} />
      {children}
    </View>
  );
}

export function MapMarker({ x, y, size = 30, children, style }) {
  return (
    <View style={[{
      position: 'absolute', left: `${x}%`, top: `${y}%`,
      marginLeft: -size / 2, marginTop: -size / 2, width: size, height: size,
      alignItems: 'center', justifyContent: 'center',
    }, style]}>
      {children}
    </View>
  );
}

export function DotMe() {
  return (
    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#0B845722', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: C.emerald, borderWidth: 2.5, borderColor: C.white, ...shadow.card }} />
    </View>
  );
}

export function CarChip({ emoji }) {
  return (
    <View style={{
      width: 32, height: 32, borderRadius: 16, backgroundColor: C.white,
      borderWidth: 1, borderColor: C.hairDark, alignItems: 'center', justifyContent: 'center', ...shadow.card,
    }}>
      <Text style={{ fontSize: 14 }}>{emoji}</Text>
    </View>
  );
}

/* dashed route between two %-points, rendered as dot segments */
export function RouteDots({ a, b, color = C.emerald, n = 14 }) {
  const dots = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = a.x + (b.x - a.x) * t;
    const bend = Math.sin(t * Math.PI) * 7;
    const y = a.y + (b.y - a.y) * t - bend;
    dots.push(<View key={i} style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`, width: 5, height: 5,
      marginLeft: -2.5, marginTop: -2.5, borderRadius: 3, backgroundColor: color, opacity: 0.75,
    }} />);
  }
  return <>{dots}</>;
}

/* ---------- radar pulse (searching) ---------- */
export function Radar({ emoji = '✦' }) {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const mk = (v, delay) => Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration: 2000, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    const l1 = mk(a1, 0), l2 = mk(a2, 900);
    l1.start(); l2.start();
    return () => { l1.stop(); l2.stop(); };
  }, []);
  const ring = (v) => ({
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    borderWidth: 1.5, borderColor: C.emerald,
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1.25] }) }],
  });
  return (
    <View style={{ width: 140, height: 140, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={ring(a1)} />
      <Animated.View style={ring(a2)} />
      <View style={{
        width: 52, height: 52, borderRadius: 26, backgroundColor: C.mint,
        borderWidth: 1, borderColor: C.mintDeep, alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 20, color: C.emerald }}>{emoji}</Text>
      </View>
    </View>
  );
}

/* ---------- OTP boxes (display) ---------- */
export function OtpDigits({ code }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
      {[...String(code || '')].map((d, i) => (
        <View key={i} style={{
          width: 46, height: 54, borderRadius: 14, backgroundColor: C.ink,
          alignItems: 'center', justifyContent: 'center', ...shadow.card,
        }}>
          <Text style={{ fontFamily: F.uiHeavy, fontSize: 22, color: C.white }}>{d}</Text>
        </View>
      ))}
    </View>
  );
}

/* ---------- OTP input row ---------- */
export function OtpInput({ length = 4, onChange, accent = C.emerald }) {
  const [vals, setVals] = useState(Array(length).fill(''));
  const refs = useRef([]);
  const set = (i, v) => {
    const next = [...vals];
    next[i] = v.slice(-1);
    setVals(next);
    onChange(next.join(''));
    if (v && i < length - 1) refs.current[i + 1]?.focus();
  };
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
      {vals.map((v, i) => (
        <TextInput
          key={i}
          ref={(r) => (refs.current[i] = r)}
          value={v}
          onChangeText={(t) => set(i, t)}
          onKeyPress={(e) => { if (e.nativeEvent.key === 'Backspace' && !v && i > 0) refs.current[i - 1]?.focus(); }}
          keyboardType="number-pad"
          maxLength={1}
          style={{
            width: 48, height: 56, borderRadius: 14, backgroundColor: C.surface,
            borderWidth: 1.5, borderColor: v ? accent : C.hairDark, textAlign: 'center',
            fontFamily: F.uiHeavy, fontSize: 20, color: accent,
          }}
        />
      ))}
    </View>
  );
}

/* ---------- section header ---------- */
export function SectionTitle({ children, right }) {
  return (
    <View style={[S.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
      <Text style={S.h3}>{children}</Text>
      {right}
    </View>
  );
}
