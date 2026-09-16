// Rider experience — home, booking (city / rental / outstation / scheduled),
// live ride with driver tracking, rating & tips, wallet + Prime, trips, profile.
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, RefreshControl, Share, Platform,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { api, usePoll, setToken } from '../api';
import { C, R, F, shadow, CATEGORY_META, inr, timeAgo, timeAt } from '../theme';
import {
  S, Btn, Pill, Input, Micro, toast, MapCanvas, MapMarker, DotMe, CarChip,
  RouteDots, Radar, OtpDigits, makeProjection, SectionTitle,
} from '../ui';

const HSR = { name: 'HSR Layout, Sector 2', lat: 12.9116, lng: 77.6474 };
const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

/* =====================================================================
   HOME
===================================================================== */
function HomeScreen({ navigation }) {
  const [me, setMe] = useState(null);
  const [active, setActive] = useState(null);

  usePoll(async () => {
    const r = await api.get('/api/me'); setMe(r.user);
    const a = await api.get('/api/rides/active'); setActive(a);
  }, 4000);

  useEffect(() => {
    if (active) navigation.navigate('Ride', { rideId: active.id });
  }, [active?.id]);

  const first = me?.name?.split(' ')[0] || 'there';
  // bento tiles: each service gets its own pastel field + deep tone
  const services = [
    { key: 'rental', title: 'Rentals', sub: 'by the hour', emoji: '⏱', tint: '#FFF1DC', deep: '#D97706', onPress: () => navigation.navigate('Rentals') },
    { key: 'outstation', title: 'Outstation', sub: 'city to city', emoji: '🛣', tint: '#E1F6E9', deep: '#0E9F5D', onPress: () => navigation.navigate('Outstation') },
    { key: 'schedule', title: 'Schedule', sub: 'book ahead', emoji: '🗓', tint: '#F1EBFE', deep: '#7C3AED', onPress: () => navigation.navigate('Search', { mode: 'schedule' }) },
    { key: 'parcel', title: 'Parcel', sub: 'send stuff', emoji: '📦', tint: '#FDE8EC', deep: '#DB2777', onPress: () => navigation.navigate('Parcel') },
  ];

  return (
    <ScrollView style={S.screen} contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={[S.pad, S.row, { justifyContent: 'space-between', paddingTop: 20 }]}>
        <View>
          <Text style={S.mut}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'} ☀</Text>
          <Text style={[S.h1, { marginTop: 4 }]}>Hey {first}</Text>
        </View>
        {me && (me.prime_until || 0) > Date.now()
          ? <Pill text="PRIME ✦" tone="gold" />
          : <Pill text={inr(me?.wallet_balance ?? 0)} tone="em" />}
      </View>

      {/* hero search — high-contrast ink card */}
      <TouchableOpacity activeOpacity={0.92} onPress={() => navigation.navigate('Search', { mode: 'city' })}
        style={[{ marginHorizontal: 22, marginTop: 18, padding: 22, borderRadius: R.lg, backgroundColor: C.ink }, shadow.float]}>
        <Text style={{ fontFamily: F.uiHeavy, fontSize: 20, color: C.white, letterSpacing: -0.4 }}>Where to?</Text>
        <View style={[S.row, { marginTop: 14, backgroundColor: '#FFFFFF14', borderRadius: 999, paddingVertical: 13, paddingHorizontal: 18, gap: 12 }]}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.emerald }} />
          <Text style={{ fontFamily: F.uiSemi, fontSize: 14.5, color: '#B9C0CC' }}>Search destination</Text>
          <View style={{ marginLeft: 'auto', backgroundColor: C.emerald, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 }}>
            <Text style={{ fontFamily: F.uiHeavy, fontSize: 12, color: C.white }}>GO</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* bento services — asymmetric pastel grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, marginTop: 16 }}>
        {services.map(sv => (
          <TouchableOpacity key={sv.key} activeOpacity={0.9} onPress={sv.onPress}
            style={[{
              width: '46%', marginHorizontal: '2%', marginBottom: 12, padding: 18,
              borderRadius: 22, backgroundColor: sv.tint,
            }]}>
            <Text style={{ fontSize: 26 }}>{sv.emoji}</Text>
            <Text style={[S.h3, { marginTop: 12, color: sv.deep }]}>{sv.title}</Text>
            <Text style={[S.mut, { marginTop: 2, fontSize: 12 }]}>{sv.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ marginHorizontal: 22, marginTop: 6 }}>
        <MapCanvas height={190}>
          <MapMarker x={48} y={56}><DotMe /></MapMarker>
          <MapMarker x={24} y={30}><CarChip emoji="🛺" /></MapMarker>
          <MapMarker x={70} y={40}><CarChip emoji="🚗" /></MapMarker>
          <MapMarker x={60} y={74}><CarChip emoji="⚡" /></MapMarker>
          <View style={{
            position: 'absolute', top: 12, left: 12, backgroundColor: C.white,
            borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14,
            borderWidth: 1, borderColor: C.hair, ...shadow.card,
          }}>
            <Text style={{ fontFamily: F.uiBold, fontSize: 11.5, color: C.inkSoft }}>
              📍 {HSR.name}
            </Text>
          </View>
        </MapCanvas>
      </View>

      <View style={[S.row, {
        marginHorizontal: 22, marginTop: 6, padding: 18, gap: 14,
        borderRadius: 22, backgroundColor: C.mint,
      }]}>
        <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: C.emerald, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 16, color: C.white }}>%</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[S.h3, { fontSize: 14, color: C.emeraldDark }]}>FIRST50 · half off your first 3 rides</Text>
          <Text style={[S.mut, { marginTop: 1 }]}>up to ₹75 · auto-applied at checkout</Text>
        </View>
      </View>
    </ScrollView>
  );
}

/* =====================================================================
   DESTINATION SEARCH
===================================================================== */
function SearchScreen({ navigation, route }) {
  const mode = route.params?.mode || 'city';
  const [q, setQ] = useState('');
  const [places, setPlaces] = useState([]);
  const [saved, setSaved] = useState([]);

  useEffect(() => { (async () => {
    setPlaces(await api.get('/api/places?q='));
    try { setSaved(await api.get('/api/saved-places')); } catch {}
  })(); }, []);

  const search = async (text) => {
    setQ(text);
    setPlaces(await api.get('/api/places?q=' + encodeURIComponent(text)));
  };

  const choose = (p) => navigation.navigate('Fare', { drop: p, mode });

  return (
    <ScrollView style={S.screen} keyboardShouldPersistTaps="handled">
      <View style={[S.pad, { paddingTop: 14 }]}>
        <Micro>{mode === 'schedule' ? 'SCHEDULE A RIDE' : 'SET DESTINATION'}</Micro>
        <View style={[S.row, { gap: 12, marginTop: 14 }]}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.emerald }} />
          <View style={[S.card, { flex: 1, padding: 14 }]}>
            <Text style={{ fontFamily: F.uiSemi, fontSize: 14, color: C.inkSoft }}>{HSR.name}</Text>
          </View>
        </View>
        <View style={[S.row, { gap: 12, marginTop: 10 }]}>
          <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: C.gold }} />
          <Input autoFocus placeholder="Where to?" value={q} onChangeText={search} style={{ flex: 1 }} />
        </View>
      </View>

      {saved.length > 0 && (
        <View style={[S.row, { paddingHorizontal: 22, marginTop: 16, gap: 10, flexWrap: 'wrap' }]}>
          {saved.map(sp => (
            <TouchableOpacity key={sp.id} onPress={() => choose(sp)}
              style={[S.card, S.row, { paddingVertical: 9, paddingHorizontal: 14, gap: 8 }]}>
              <Text>{sp.label === 'home' ? '🏠' : sp.label === 'work' ? '💼' : '📌'}</Text>
              <Text style={{ fontFamily: F.uiBold, fontSize: 12.5, color: C.inkSoft }}>
                {sp.label.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ marginTop: 14 }}>
        {places.map(p => (
          <TouchableOpacity key={p.name} onPress={() => choose(p)}
            style={[S.row, { paddingVertical: 15, paddingHorizontal: 22, gap: 14, borderBottomWidth: 1, borderColor: C.hair }]}>
            <View style={{
              width: 38, height: 38, borderRadius: 12, backgroundColor: p.recent ? C.mint : C.sand,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: p.recent ? C.emerald : C.gold }}>{p.recent ? '↺' : '⌖'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[S.h3, { fontSize: 14.5 }]}>{p.name}</Text>
              <Text style={S.mut}>{p.recent ? 'Recent destination' : 'Bengaluru'}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

/* =====================================================================
   FARE SELECT (city + schedule)
===================================================================== */
function FareScreen({ navigation, route }) {
  const { drop, mode } = route.params;
  const [est, setEst] = useState(null);
  const [cat, setCat] = useState('auto');
  const [pay, setPay] = useState('wallet');
  const [promo, setPromo] = useState('FIRST50');
  const [showBreak, setShowBreak] = useState(false);
  const [when, setWhen] = useState(null);        // scheduled_at
  const [busy, setBusy] = useState(false);
  const [stops, setStops] = useState([]);        // multi-stop (max 2)
  const [stopPick, setStopPick] = useState(false);
  const [stopChoices, setStopChoices] = useState([]);
  const [forGuest, setForGuest] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [corporate, setCorporate] = useState(false);
  const [expenseCode, setExpenseCode] = useState('');

  useEffect(() => { (async () => {
    try { setEst(await api.post('/api/fares/estimate', { pickup: HSR, drop, stops })); }
    catch (e) { toast(e.message, true); }
  })(); }, [stops]);

  const openStopPicker = async () => {
    setStopChoices((await api.get('/api/places?q=')).filter(p => p.name !== drop.name).slice(0, 6));
    setStopPick(true);
  };

  const sel = est?.options.find(o => o.category === cat) || est?.options?.[1];

  const scheduleOptions = [
    { label: 'In 1 hour', at: () => Date.now() + 3600e3 },
    { label: 'Tonight 8 pm', at: () => { const d = new Date(); d.setHours(20, 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); return d.getTime(); } },
    { label: 'Tomorrow 9 am', at: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); } },
  ];

  const book = async () => {
    setBusy(true);
    try {
      if (forGuest && (!guestName || !guestPhone)) { toast('Guest name and phone needed', true); setBusy(false); return; }
      const r = await api.post('/api/rides', {
        pickup: HSR, drop, stops, category: sel.category, payment_method: pay,
        promo_code: promo || undefined,
        scheduled_at: mode === 'schedule' ? when : undefined,
        guest_name: forGuest ? guestName : undefined,
        guest_phone: forGuest ? guestPhone : undefined,
        is_corporate: corporate || undefined,
        expense_code: corporate && expenseCode ? expenseCode : undefined,
        type: 'city',
      });
      if (r.status === 'SCHEDULED') {
        toast(`Ride scheduled for ${timeAt(r.scheduled_at)}`);
        navigation.popToTop();
      } else {
        navigation.replace('Ride', { rideId: r.id });
        if (r.promo_discount > 0) toast(`Promo applied — you save ${inr(r.promo_discount)}`);
      }
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };

  const proj = makeProjection([HSR, drop]);
  const a = proj(HSR.lat, HSR.lng), b = proj(drop.lat, drop.lng);

  return (
    <ScrollView style={S.screen} contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={{ marginHorizontal: 22, marginTop: 14 }}>
        <MapCanvas height={170}>
          <RouteDots a={a} b={b} color={C.gold} />
          <MapMarker x={a.x} y={a.y}><DotMe /></MapMarker>
          <MapMarker x={b.x} y={b.y}><Text style={{ fontSize: 18 }}>⚑</Text></MapMarker>
        </MapCanvas>
      </View>

      {est && (
        <View style={[S.row, S.pad, { justifyContent: 'space-between', marginTop: 14 }]}>
          <Text style={S.mut}>{est.distKm} km · ~{est.durMin} min</Text>
          {est.surge > 1 && <Pill text={`${est.surge}× SURGE`} tone="amber" />}
          {est.night && <Pill text="NIGHT FARE" tone="vi" />}
          {est.prime && <Pill text="PRIME PRICING ✦" tone="gold" />}
        </View>
      )}

      <View style={{ paddingHorizontal: 22, marginTop: 10 }}>
        {!est && <Text style={[S.mut, { padding: 20 }]}>Calculating fares…</Text>}
        {est?.options.map(o => {
          const meta = CATEGORY_META[o.category] || {};
          const on = o.category === (sel?.category);
          return (
            <TouchableOpacity key={o.category} activeOpacity={0.9} onPress={() => setCat(o.category)}
              style={[S.card, S.row, {
                padding: 14, marginBottom: 9, gap: 14,
                borderColor: on ? C.emerald : C.hair, borderWidth: on ? 1.5 : 1,
                backgroundColor: on ? C.mint : C.surface,
              }]}>
              <View style={{
                width: 46, height: 46, borderRadius: 14, backgroundColor: meta.tint || C.sand,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 20 }}>{o.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.h3}>{o.label}</Text>
                <Text style={S.mut}>{o.seats} seat{o.seats > 1 ? 's' : ''} · {o.etaMin} min away</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontFamily: F.uiHeavy, fontSize: 17, color: C.ink }}>{inr(o.fare)}</Text>
                <Text style={[S.mut, { fontSize: 10, letterSpacing: 1 }]}>UPFRONT</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        {sel && (
          <TouchableOpacity onPress={() => setShowBreak(true)}>
            <Text style={{ fontFamily: F.uiBold, fontSize: 12.5, color: C.emerald, textAlign: 'center', marginVertical: 6 }}>
              View fare breakdown ↓
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* multi-stop */}
      <View style={[S.row, S.pad, { gap: 8, marginTop: 6, flexWrap: 'wrap' }]}>
        {stops.map((st, i) => (
          <TouchableOpacity key={st.name} onPress={() => setStops(stops.filter((_, j) => j !== i))}
            style={[S.card, S.row, { paddingVertical: 8, paddingHorizontal: 13, gap: 7, borderColor: C.mintDeep, backgroundColor: C.mint }]}>
            <Text style={{ fontFamily: F.uiBold, fontSize: 11.5, color: C.emeraldDark }}>◦ {st.name.split(',')[0]}</Text>
            <Text style={{ color: C.red, fontSize: 11 }}>✕</Text>
          </TouchableOpacity>
        ))}
        {stops.length < 2 && (
          <TouchableOpacity onPress={openStopPicker}
            style={[S.card, { paddingVertical: 8, paddingHorizontal: 13 }]}>
            <Text style={{ fontFamily: F.uiBold, fontSize: 11.5, color: C.emerald }}>+ Add stop</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* guest + corporate toggles */}
      <View style={[S.row, S.pad, { gap: 9, marginTop: 10 }]}>
        <TouchableOpacity onPress={() => setForGuest(!forGuest)}
          style={[S.card, { flex: 1, padding: 12, alignItems: 'center', borderColor: forGuest ? C.emerald : C.hair, backgroundColor: forGuest ? C.mint : C.surface }]}>
          <Text style={{ fontFamily: F.uiBold, fontSize: 12, color: forGuest ? C.emeraldDark : C.mut }}>👤 For someone else</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCorporate(!corporate)}
          style={[S.card, { flex: 1, padding: 12, alignItems: 'center', borderColor: corporate ? C.violet : C.hair, backgroundColor: corporate ? C.violetSoft : C.surface }]}>
          <Text style={{ fontFamily: F.uiBold, fontSize: 12, color: corporate ? C.violet : C.mut }}>💼 Corporate</Text>
        </TouchableOpacity>
      </View>
      {forGuest && (
        <View style={[S.row, S.pad, { gap: 9, marginTop: 9 }]}>
          <Input placeholder="Guest name" value={guestName} onChangeText={setGuestName} style={{ flex: 1, paddingVertical: 12 }} />
          <Input placeholder="Guest phone" value={guestPhone} onChangeText={setGuestPhone} keyboardType="phone-pad" style={{ flex: 1, paddingVertical: 12 }} />
        </View>
      )}
      {corporate && (
        <View style={[S.pad, { marginTop: 9 }]}>
          <Input placeholder="Expense / project code (optional)" value={expenseCode} onChangeText={setExpenseCode} style={{ paddingVertical: 12 }} />
        </View>
      )}

      {mode === 'schedule' && (
        <View style={[S.pad, { marginTop: 8 }]}>
          <Micro>PICK A TIME</Micro>
          <View style={[S.row, { gap: 9, marginTop: 10, flexWrap: 'wrap' }]}>
            {scheduleOptions.map(so => {
              const at = so.at();
              const on = when && Math.abs(when - at) < 60e3;
              return (
                <TouchableOpacity key={so.label} onPress={() => setWhen(at)}
                  style={[S.card, { paddingVertical: 10, paddingHorizontal: 16, borderColor: on ? C.emerald : C.hair, backgroundColor: on ? C.mint : C.surface }]}>
                  <Text style={{ fontFamily: F.uiBold, fontSize: 12.5, color: on ? C.emeraldDark : C.inkSoft }}>{so.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <View style={[S.row, S.pad, { gap: 10, marginTop: 14 }]}>
        {['wallet', 'cash'].map(pm => (
          <TouchableOpacity key={pm} onPress={() => setPay(pm)}
            style={[S.card, { flex: 1, padding: 13, alignItems: 'center', borderColor: pay === pm ? C.emerald : C.hair, backgroundColor: pay === pm ? C.mint : C.surface }]}>
            <Text style={{ fontFamily: F.uiBold, fontSize: 13, color: pay === pm ? C.emeraldDark : C.mut }}>
              {pm === 'wallet' ? '◈ Wallet' : '₹ Cash'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[S.pad, { marginTop: 10 }]}>
        <Input value={promo} onChangeText={setPromo} placeholder="PROMO CODE" autoCapitalize="characters" />
      </View>

      <View style={[S.pad, { marginTop: 16 }]}>
        <Btn
          title={busy ? 'Booking…'
            : mode === 'schedule'
              ? (when ? `Schedule ${sel?.label} · ${inr(sel?.fare)}` : 'Pick a time first')
              : `Book ${sel?.label || ''} · ${inr(sel?.fare)}`}
          onPress={book}
          disabled={busy || !sel || (mode === 'schedule' && !when)}
        />
      </View>

      {/* stop picker modal */}
      <Modal visible={stopPick} transparent animationType="slide" onRequestClose={() => setStopPick(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: '#18242066' }} activeOpacity={1} onPress={() => setStopPick(false)} />
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '60%' }}>
          <Micro color={C.gold}>ADD A STOP</Micro>
          <ScrollView style={{ marginTop: 10 }}>
            {stopChoices.filter(p => !stops.find(s => s.name === p.name)).map(p => (
              <TouchableOpacity key={p.name}
                onPress={() => { setStops([...stops, p]); setStopPick(false); }}
                style={[S.row, { paddingVertical: 13, gap: 12, borderBottomWidth: 1, borderColor: C.hair }]}>
                <Text>◦</Text><Text style={[S.h3, { fontSize: 14 }]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* fare breakdown modal */}
      <Modal visible={showBreak} transparent animationType="slide" onRequestClose={() => setShowBreak(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: '#18242066' }} activeOpacity={1} onPress={() => setShowBreak(false)} />
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 26 }}>
          <Micro color={C.gold}>FARE BREAKDOWN · {sel?.label?.toUpperCase()}</Micro>
          {sel && Object.entries(sel.breakdown).map(([k, v]) => {
            if (k === 'surge_multiplier') return null;
            if (!v && !['base_fare', 'gst'].includes(k)) return null;
            const label = k.replace(/_/g, ' ');
            return (
              <View key={k} style={[S.row, { justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: C.hair }]}>
                <Text style={[S.body, { textTransform: 'capitalize' }]}>{label}</Text>
                <Text style={{ fontFamily: F.uiBold, color: v < 0 ? C.emerald : C.ink }}>
                  {v < 0 ? '−' : ''}{inr(Math.abs(v))}
                </Text>
              </View>
            );
          })}
          <View style={[S.row, { justifyContent: 'space-between', paddingTop: 14 }]}>
            <Text style={S.h3}>Total (upfront)</Text>
            <Text style={{ fontFamily: F.uiHeavy, fontSize: 20, color: C.emerald }}>{inr(sel?.fare)}</Text>
          </View>
          <Btn title="Done" kind="soft" onPress={() => setShowBreak(false)} style={{ marginTop: 18 }} />
        </View>
      </Modal>
    </ScrollView>
  );
}

/* =====================================================================
   RENTALS
===================================================================== */
function RentalsScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [pkg, setPkg] = useState('2h20');
  const [cat, setCat] = useState('mini');
  const [busy, setBusy] = useState(false);

  useEffect(() => { (async () => setData(await api.get('/api/fares/rentals')))(); }, []);

  const opt = data?.options.find(o => o.package_id === pkg && o.category === cat);

  const book = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/rides', {
        pickup: HSR, category: cat, type: 'rental', package_id: pkg, payment_method: 'wallet',
      });
      navigation.replace('Ride', { rideId: r.id });
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };

  return (
    <ScrollView style={S.screen} contentContainerStyle={{ padding: 22, paddingBottom: 34 }}>
      <Micro color={C.gold}>HOURLY RENTALS</Micro>
      <Text style={[S.h2, { marginTop: 8 }]}>Keep the car, <Text style={S.serif}>roam free.</Text></Text>
      <Text style={[S.body, { marginTop: 8 }]}>One booking, multiple stops, the driver waits for you. Extra km & minutes billed at package rates.</Text>

      <Micro style={{ marginTop: 22 }}>PACKAGE</Micro>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 10 }}>
        {data?.packages.map(p => (
          <TouchableOpacity key={p.id} onPress={() => setPkg(p.id)}
            style={[S.card, { paddingVertical: 12, paddingHorizontal: 16, borderColor: pkg === p.id ? C.emerald : C.hair, backgroundColor: pkg === p.id ? C.mint : C.surface }]}>
            <Text style={{ fontFamily: F.uiHeavy, fontSize: 14, color: pkg === p.id ? C.emeraldDark : C.ink }}>{p.hours}h</Text>
            <Text style={S.mut}>{p.km} km</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Micro style={{ marginTop: 22 }}>VEHICLE</Micro>
      {data && ['mini', 'prime', 'suv', 'ev'].map(c => {
        const o = data.options.find(x => x.package_id === pkg && x.category === c);
        if (!o) return null;
        const on = cat === c;
        return (
          <TouchableOpacity key={c} onPress={() => setCat(c)}
            style={[S.card, S.row, { padding: 14, marginTop: 9, gap: 14, borderColor: on ? C.emerald : C.hair, backgroundColor: on ? C.mint : C.surface }]}>
            <Text style={{ fontSize: 22 }}>{o.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={S.h3}>{o.label.split('·')[0].trim()}</Text>
              <Text style={S.mut}>extra: {inr(o.breakdown.extra_km_rate)}/km · {inr(o.breakdown.extra_min_rate)}/min</Text>
            </View>
            <Text style={{ fontFamily: F.uiHeavy, fontSize: 17 }}>{inr(o.fare)}</Text>
          </TouchableOpacity>
        );
      })}

      <Btn title={busy ? 'Booking…' : `Book rental · ${inr(opt?.fare)}`} onPress={book}
        disabled={busy || !opt} style={{ marginTop: 22 }} />
    </ScrollView>
  );
}

/* =====================================================================
   OUTSTATION
===================================================================== */
function OutstationScreen({ navigation }) {
  const [dest, setDest] = useState(null);
  const [places, setPlaces] = useState([]);
  const [tripType, setTripType] = useState('round');
  const [est, setEst] = useState(null);
  const [cat, setCat] = useState('mini');
  const [busy, setBusy] = useState(false);

  useEffect(() => { (async () => {
    const all = await api.get('/api/places?q=');
    setPlaces(all.filter(p => /Mysuru|Nandi|Airport/.test(p.name)));
  })(); }, []);

  useEffect(() => { if (dest) (async () => {
    setEst(await api.post('/api/fares/outstation', { pickup: HSR, drop: dest, trip_type: tripType }));
  })(); }, [dest, tripType]);

  const opt = est?.options.find(o => o.category === cat);

  const book = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/rides', {
        pickup: HSR, drop: dest, category: cat, type: 'outstation', trip_type: tripType, payment_method: 'wallet',
      });
      navigation.replace('Ride', { rideId: r.id });
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };

  return (
    <ScrollView style={S.screen} contentContainerStyle={{ padding: 22, paddingBottom: 34 }}>
      <Micro color={C.gold}>OUTSTATION</Micro>
      <Text style={[S.h2, { marginTop: 8 }]}>Leave the city <Text style={S.serif}>behind.</Text></Text>

      <Micro style={{ marginTop: 20 }}>DESTINATION</Micro>
      {places.map(p => (
        <TouchableOpacity key={p.name} onPress={() => setDest(p)}
          style={[S.card, S.row, { padding: 14, marginTop: 9, gap: 12, borderColor: dest?.name === p.name ? C.emerald : C.hair, backgroundColor: dest?.name === p.name ? C.mint : C.surface }]}>
          <Text>🛣</Text><Text style={[S.h3, { flex: 1, fontSize: 14 }]}>{p.name}</Text>
        </TouchableOpacity>
      ))}

      <View style={[S.row, { backgroundColor: C.sand, borderRadius: 999, padding: 4, marginTop: 18 }]}>
        {[['oneway', 'One way'], ['round', 'Round trip']].map(([v, l]) => (
          <TouchableOpacity key={v} onPress={() => setTripType(v)} style={{
            flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: 'center',
            backgroundColor: tripType === v ? C.white : 'transparent',
          }}>
            <Text style={{ fontFamily: F.uiBold, fontSize: 12.5, color: tripType === v ? C.emeraldDark : C.mut }}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {est && (
        <>
          <Text style={[S.mut, { marginTop: 14 }]}>
            {est.oneWayKm} km one-way · billed {opt?.breakdown.billed_km} km · incl. driver allowance {inr(opt?.breakdown.driver_allowance)}
          </Text>
          {est.options.map(o => (
            <TouchableOpacity key={o.category} onPress={() => setCat(o.category)}
              style={[S.card, S.row, { padding: 14, marginTop: 9, gap: 14, borderColor: cat === o.category ? C.emerald : C.hair, backgroundColor: cat === o.category ? C.mint : C.surface }]}>
              <Text style={{ fontSize: 22 }}>{o.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={S.h3}>{o.label}</Text>
                <Text style={S.mut}>{inr(o.breakdown.per_km)}/km</Text>
              </View>
              <Text style={{ fontFamily: F.uiHeavy, fontSize: 17 }}>{inr(o.fare)}</Text>
            </TouchableOpacity>
          ))}
          <Btn title={busy ? 'Booking…' : `Book outstation · ${inr(opt?.fare)}`} onPress={book}
            disabled={busy || !opt} style={{ marginTop: 20 }} />
        </>
      )}
    </ScrollView>
  );
}

/* =====================================================================
   PARCEL — bike courier: size tier + sender/receiver, delivery OTP
===================================================================== */
function ParcelScreen({ navigation }) {
  const [dest, setDest] = useState(null);
  const [places, setPlaces] = useState([]);
  const [est, setEst] = useState(null);
  const [size, setSize] = useState('small');
  const [sender, setSender] = useState('');
  const [receiver, setReceiver] = useState('');
  const [rPhone, setRPhone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { (async () => setPlaces((await api.get('/api/places?q=')).slice(0, 6)))(); }, []);
  useEffect(() => { if (dest) (async () => {
    setEst(await api.post('/api/fares/parcel', { pickup: HSR, drop: dest }));
  })(); }, [dest]);

  const opt = est?.options.find(o => o.size === size);

  const book = async () => {
    if (!receiver || !rPhone) return toast('Receiver name and phone needed', true);
    setBusy(true);
    try {
      const r = await api.post('/api/rides', {
        pickup: HSR, drop: dest, category: 'bike', type: 'parcel', parcel_size: size,
        parcel: { sender: sender || 'Me', receiver, receiver_phone: rPhone },
        payment_method: 'wallet',
      });
      toast('Courier booked — share the OTP with the receiver');
      navigation.replace('Ride', { rideId: r.id });
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };

  return (
    <ScrollView style={S.screen} contentContainerStyle={{ padding: 22, paddingBottom: 34 }}>
      <Micro color={C.gold}>RYDER PARCEL</Micro>
      <Text style={[S.h2, { marginTop: 8 }]}>Send it <Text style={S.serif}>across town.</Text></Text>
      <Text style={[S.body, { marginTop: 8 }]}>A verified bike partner picks it up and delivers it. The receiver confirms with your delivery code.</Text>

      <Micro style={{ marginTop: 20 }}>DELIVER TO</Micro>
      {places.map(p => (
        <TouchableOpacity key={p.name} onPress={() => setDest(p)}
          style={[S.card, S.row, { padding: 13, marginTop: 8, gap: 12, borderColor: dest?.name === p.name ? C.emerald : C.hair, backgroundColor: dest?.name === p.name ? C.mint : C.surface }]}>
          <Text>📍</Text><Text style={[S.h3, { flex: 1, fontSize: 13.5 }]}>{p.name}</Text>
        </TouchableOpacity>
      ))}

      {est && (
        <>
          <Micro style={{ marginTop: 20 }}>PACKAGE SIZE</Micro>
          {est.options.map(o => (
            <TouchableOpacity key={o.size} onPress={() => setSize(o.size)}
              style={[S.card, S.row, { padding: 14, marginTop: 8, gap: 12, borderColor: size === o.size ? C.emerald : C.hair, backgroundColor: size === o.size ? C.mint : C.surface }]}>
              <Text style={{ fontSize: 20 }}>📦</Text>
              <Text style={[S.h3, { flex: 1, fontSize: 14 }]}>{o.label}</Text>
              <Text style={{ fontFamily: F.uiHeavy, fontSize: 16 }}>{inr(o.fare)}</Text>
            </TouchableOpacity>
          ))}

          <Micro style={{ marginTop: 20 }}>DETAILS</Micro>
          <Input placeholder="Sender name (optional)" value={sender} onChangeText={setSender} style={{ marginTop: 10 }} />
          <Input placeholder="Receiver name" value={receiver} onChangeText={setReceiver} style={{ marginTop: 10 }} />
          <Input placeholder="Receiver phone" value={rPhone} onChangeText={setRPhone} keyboardType="phone-pad" style={{ marginTop: 10 }} />

          <Btn title={busy ? 'Booking…' : `Book courier · ${inr(opt?.fare)}`} onPress={book}
            disabled={busy || !opt} style={{ marginTop: 20 }} />
          <Text style={[S.mut, { textAlign: 'center', marginTop: 12 }]}>
            {est.distKm} km · no cash on delivery · prohibited items list applies
          </Text>
        </>
      )}
    </ScrollView>
  );
}

/* =====================================================================
   LIVE RIDE
===================================================================== */
const ST_LABEL = {
  SEARCHING: 'Finding your driver…', ACCEPTED: 'Driver en route',
  ARRIVED: 'Your driver has arrived', ONGOING: 'On the way',
};
const ST_STEP = { SEARCHING: 0, ACCEPTED: 1, ARRIVED: 2, ONGOING: 3 };

const CANCEL_REASONS = [
  'Driver is too far away', 'Plans changed', 'Booked by mistake',
  'Driver asked to cancel', 'Wait time too long', 'Found another ride',
];

function RideScreen({ navigation, route }) {
  const { rideId } = route.params;
  const [ride, setRide] = useState(null);
  const [showCancel, setShowCancel] = useState(false);

  usePoll(async () => {
    const r = await api.get('/api/rides/' + rideId);
    setRide(r);
    if (r.status === 'COMPLETED') navigation.replace('Rate', { ride: r });
    else if (['CANCELLED', 'EXPIRED'].includes(r.status)) {
      toast(r.status === 'EXPIRED' ? 'No drivers available right now — try again' : 'Ride cancelled', r.status === 'EXPIRED');
      navigation.popToTop();
    }
  }, 2500, [rideId]);

  if (!ride) return <View style={S.screen} />;

  const searching = ride.status === 'SEARCHING';
  const pts = [
    { lat: ride.pickup_lat, lng: ride.pickup_lng },
    { lat: ride.drop_lat, lng: ride.drop_lng },
  ];
  if (ride.driver_lat) pts.push({ lat: ride.driver_lat, lng: ride.driver_lng });
  const proj = makeProjection(pts);
  const a = proj(ride.pickup_lat, ride.pickup_lng);
  const b = proj(ride.drop_lat, ride.drop_lng);
  const d = ride.driver_lat ? proj(ride.driver_lat, ride.driver_lng) : null;
  const meta = CATEGORY_META[ride.driver_cat] || {};

  const sos = async () => {
    try { await api.post(`/api/rides/${ride.id}/sos`, { lat: ride.pickup_lat, lng: ride.pickup_lng });
      toast('SOS raised — safety desk has your live location'); }
    catch (e) { toast(e.message, true); }
  };
  const share = async () => {
    try { await Share.share({ message: `Tracking my Ryder trip ${ride.id} — driver ${ride.driver_name} (${ride.plate}).` }); }
    catch { toast('Trip details ready to share'); }
  };
  const cancel = async (reason) => {
    setShowCancel(false);
    try { await api.post(`/api/rides/${ride.id}/cancel`, { reason: reason || 'rider cancelled' }); }
    catch (e) { toast(e.message, true); }
  };

  return (
    <ScrollView style={S.screen} contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={[S.row, S.pad, { justifyContent: 'space-between', paddingTop: 16 }]}>
        <Text style={S.h2}>{ST_LABEL[ride.status]}</Text>
        <Pill text="LIVE" tone="em" />
      </View>
      <View style={[S.row, { paddingHorizontal: 22, gap: 6, marginTop: 12 }]}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={{
            flex: 1, height: 4, borderRadius: 99,
            backgroundColor: i <= ST_STEP[ride.status] ? C.emerald : C.hairDark,
          }} />
        ))}
      </View>

      {searching ? (
        <View style={{ alignItems: 'center', paddingTop: 44 }}>
          <Radar />
          <Text style={[S.body, { marginTop: 20 }]}>Reaching the nearest partners…</Text>
          <Btn title="Cancel request" kind="ghost" onPress={() => cancel('cancelled while searching')} style={{ marginTop: 30 }} />
        </View>
      ) : (
        <>
          <View style={{ marginHorizontal: 22, marginTop: 16 }}>
            <MapCanvas height={230}>
              <RouteDots a={a} b={b} color={C.gold} />
              <MapMarker x={a.x} y={a.y}><DotMe /></MapMarker>
              <MapMarker x={b.x} y={b.y}><Text style={{ fontSize: 18 }}>⚑</Text></MapMarker>
              {d && <MapMarker x={d.x} y={d.y}><CarChip emoji={meta.emoji || '🚗'} /></MapMarker>}
            </MapCanvas>
          </View>

          <View style={[S.card, S.row, { marginHorizontal: 22, marginTop: 14, padding: 16, gap: 14 }]}>
            <View style={{
              width: 50, height: 50, borderRadius: 25, backgroundColor: C.mint,
              alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.mintDeep,
            }}>
              <Text style={{ fontFamily: F.uiHeavy, fontSize: 16, color: C.emeraldDark }}>
                {(ride.driver_name || '—').split(' ').map(w => w[0]).join('').slice(0, 2)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.h3}>{ride.driver_name}</Text>
              <Text style={S.mut}>★ {(ride.driver_rating || 5).toFixed(2)} · {ride.vehicle_make}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={{ backgroundColor: C.ink, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 }}>
                <Text style={{ fontFamily: F.uiBold, fontSize: 12, color: C.white, letterSpacing: 1 }}>{ride.plate}</Text>
              </View>
            </View>
          </View>

          {ride.status !== 'ONGOING' && (
            <View style={[S.card, { marginHorizontal: 22, marginTop: 12, padding: 18, alignItems: 'center', backgroundColor: C.goldSoft, borderColor: '#E8DCC0' }]}>
              <Micro color={C.gold}>SHARE THIS CODE TO BEGIN</Micro>
              <View style={{ marginTop: 12 }}><OtpDigits code={ride.otp} /></View>
            </View>
          )}

          <View style={[S.row, S.pad, { gap: 9, marginTop: 14 }]}>
            <Btn title="Call" kind="soft" small style={{ flex: 1 }} onPress={() => toast('Calling via masked line…')} />
            <Btn title="Share trip" kind="soft" small style={{ flex: 1 }} onPress={share} />
            <Btn title="SOS" kind="danger" small style={{ flex: 1 }} onPress={sos} />
          </View>

          <View style={[S.row, S.pad, { justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderColor: C.hair, marginHorizontal: 22, paddingHorizontal: 0 }]}>
            <Text style={[S.mut, { flex: 1 }]}>{ride.pickup_addr} → {ride.drop_addr}</Text>
            <Text style={{ fontFamily: F.uiHeavy, fontSize: 17 }}>{inr(ride.fare_quoted)}</Text>
          </View>
          {(ride.guest_name || ride.parcel_details) && (
            <View style={[S.card, { marginHorizontal: 22, marginTop: 12, padding: 14, backgroundColor: C.violetSoft, borderColor: '#DCD6F2' }]}>
              {ride.guest_name && (
                <Text style={[S.body, { fontSize: 13 }]}>👤 Booked for <Text style={{ fontFamily: F.uiBold }}>{ride.guest_name}</Text> · {ride.guest_phone}</Text>
              )}
              {ride.parcel_details && (
                <Text style={[S.body, { fontSize: 13 }]}>📦 To <Text style={{ fontFamily: F.uiBold }}>{ride.parcel_details.receiver}</Text> · {ride.parcel_details.receiver_phone} — they confirm delivery with your code</Text>
              )}
            </View>
          )}
          {ride.status !== 'ONGOING' && (
            <View style={[S.pad, { marginTop: 12 }]}>
              <Btn title="Cancel ride" kind="ghost" onPress={() => setShowCancel(true)} />
            </View>
          )}
        </>
      )}

      {/* cancel-reason sheet */}
      <Modal visible={showCancel} transparent animationType="slide" onRequestClose={() => setShowCancel(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: '#18242066' }} activeOpacity={1} onPress={() => setShowCancel(false)} />
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 }}>
          <Micro color={C.gold}>WHY ARE YOU CANCELLING?</Micro>
          <Text style={[S.mut, { marginTop: 6 }]}>A ₹30 fee applies more than a minute after your driver accepts.</Text>
          {CANCEL_REASONS.map(r => (
            <TouchableOpacity key={r} onPress={() => cancel(r)}
              style={[S.row, { paddingVertical: 14, borderBottomWidth: 1, borderColor: C.hair }]}>
              <Text style={[S.h3, { fontSize: 14 }]}>{r}</Text>
            </TouchableOpacity>
          ))}
          <Btn title="Keep my ride" kind="soft" onPress={() => setShowCancel(false)} style={{ marginTop: 16 }} />
        </View>
      </Modal>
    </ScrollView>
  );
}

/* =====================================================================
   RATE
===================================================================== */
function RateScreen({ navigation, route }) {
  const { ride } = route.params;
  const [stars, setStars] = useState(5);
  const [tags, setTags] = useState([]);
  const [faved, setFaved] = useState(false);
  const allTags = ['Immaculate car', 'Smooth route', 'Great conversation', 'Blissfully quiet'];

  const favourite = async () => {
    try {
      await api.post('/api/favourites', { driver_id: ride.driver_id, remove: faved });
      setFaved(!faved);
      toast(faved ? 'Removed from favourites' : `${ride.driver_name} added to favourites — they'll get priority on your future rides`);
    } catch (e) { toast(e.message, true); }
  };

  const submit = async () => {
    try { await api.post(`/api/rides/${ride.id}/rate`, { stars, tags }); toast('Thank you — rating recorded'); }
    catch (e) { toast(e.message, true); }
    navigation.popToTop();
  };
  const tip = async (amt) => {
    try { await api.post(`/api/rides/${ride.id}/tip`, { amount: amt }); toast(`${inr(amt)} tip sent with gratitude`); }
    catch (e) { toast(e.message, true); }
  };

  return (
    <ScrollView style={S.screen} contentContainerStyle={{ alignItems: 'center', padding: 30, paddingTop: 50 }}>
      <View style={{
        width: 84, height: 84, borderRadius: 42, backgroundColor: C.mint,
        borderWidth: 1, borderColor: C.mintDeep, alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 34, color: C.emerald }}>✓</Text>
      </View>
      <Text style={[S.h1, { marginTop: 22 }]}>You've <Text style={S.serif}>arrived.</Text></Text>
      <Text style={{ fontFamily: F.uiHeavy, fontSize: 42, color: C.ink, marginTop: 14 }}>{inr(ride.fare_final)}</Text>
      <Text style={{ fontFamily: F.uiBold, fontSize: 12.5, color: C.emerald, marginTop: 4 }}>
        {ride.payment_method === 'wallet' ? 'Paid from wallet ✓' : 'Paid in cash'}
      </Text>

      <Text style={[S.body, { marginTop: 28 }]}>How was your ride with {ride.driver_name}?</Text>
      <View style={[S.row, { gap: 8, marginTop: 12 }]}>
        {[1, 2, 3, 4, 5].map(n => (
          <TouchableOpacity key={n} onPress={() => setStars(n)}>
            <Text style={{ fontSize: 36, color: n <= stars ? C.gold : C.hairDark }}>★</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, justifyContent: 'center', marginTop: 16 }}>
        {allTags.map(t => {
          const on = tags.includes(t);
          return (
            <TouchableOpacity key={t} onPress={() => setTags(on ? tags.filter(x => x !== t) : [...tags, t])}
              style={[S.card, { paddingVertical: 9, paddingHorizontal: 15, borderColor: on ? C.gold : C.hair, backgroundColor: on ? C.goldSoft : C.surface }]}>
              <Text style={{ fontFamily: F.uiSemi, fontSize: 12, color: on ? C.gold : C.mut }}>{t}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity onPress={favourite} style={[S.card, S.row, {
        paddingVertical: 12, paddingHorizontal: 18, gap: 10, marginTop: 18,
        borderColor: faved ? C.gold : C.hair, backgroundColor: faved ? C.goldSoft : C.surface,
      }]}>
        <Text style={{ fontSize: 16, color: faved ? C.gold : C.mut }}>{faved ? '★' : '☆'}</Text>
        <Text style={{ fontFamily: F.uiBold, fontSize: 13, color: faved ? C.gold : C.inkSoft }}>
          {faved ? 'Favourite driver' : 'Add to favourite drivers'}
        </Text>
      </TouchableOpacity>
      <Btn title="Submit rating" onPress={submit} style={{ marginTop: 18, alignSelf: 'stretch' }} />
      <Btn title="Add ₹20 tip" kind="soft" onPress={() => tip(20)} style={{ marginTop: 10, alignSelf: 'stretch' }} />
      <Btn title="Skip" kind="ghost" onPress={() => navigation.popToTop()} style={{ marginTop: 10, alignSelf: 'stretch' }} />
    </ScrollView>
  );
}

/* =====================================================================
   TRIPS (history + scheduled)
===================================================================== */
function TripsScreen() {
  const [rides, setRides] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [receipt, setReceipt] = useState(null);   // ride whose receipt is open

  const load = useCallback(async () => {
    setRides(await api.get('/api/rides'));
    setScheduled(await api.get('/api/rides/scheduled'));
  }, []);
  usePoll(load, 8000);

  const cancelScheduled = async (id) => {
    try { await api.post(`/api/rides/${id}/cancel`, { reason: 'schedule cancelled' }); toast('Scheduled ride cancelled'); load(); }
    catch (e) { toast(e.message, true); }
  };

  const tone = { COMPLETED: 'em', CANCELLED: 'red', EXPIRED: 'mut', SCHEDULED: 'vi' };

  return (
    <ScrollView style={S.screen} contentContainerStyle={{ padding: 22, paddingBottom: 34 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Text style={S.h1}>Your trips<Text style={S.serif}>.</Text></Text>

      {scheduled.length > 0 && (
        <>
          <Micro style={{ marginTop: 20 }}>SCHEDULED</Micro>
          {scheduled.map(r => (
            <View key={r.id} style={[S.card, { padding: 16, marginTop: 10, borderColor: '#DCD6F2' }]}>
              <View style={[S.row, { justifyContent: 'space-between' }]}>
                <Text style={S.h3}>{timeAt(r.scheduled_at)}</Text>
                <Pill text="SCHEDULED" tone="vi" />
              </View>
              <Text style={[S.mut, { marginTop: 6 }]}>{r.pickup_addr} → {r.drop_addr} · {inr(r.fare_quoted)}</Text>
              <Btn title="Cancel schedule" kind="ghost" small onPress={() => cancelScheduled(r.id)} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
            </View>
          ))}
        </>
      )}

      <Micro style={{ marginTop: 20 }}>HISTORY · tap a trip for its receipt</Micro>
      {rides.filter(r => r.status !== 'SCHEDULED').map(r => (
        <TouchableOpacity key={r.id} activeOpacity={0.85}
          onPress={() => r.status === 'COMPLETED' && setReceipt(r)}
          style={[S.card, { padding: 16, marginTop: 10 }]}>
          <View style={[S.row, { justifyContent: 'space-between' }]}>
            <Text style={S.h3}>{inr(r.fare_final ?? r.fare_quoted)} · {r.type === 'city' ? r.category : r.type}</Text>
            <Pill text={r.status} tone={tone[r.status] || 'gold'} />
          </View>
          <Text style={[S.mut, { marginTop: 6 }]}>● {r.pickup_addr}</Text>
          <Text style={S.mut}>⚑ {r.drop_addr} · {timeAgo(r.requested_at)}</Text>
        </TouchableOpacity>
      ))}
      {rides.length === 0 && <Text style={[S.mut, { marginTop: 16 }]}>Your journeys will appear here.</Text>}

      {/* itemized receipt */}
      <Modal visible={!!receipt} transparent animationType="slide" onRequestClose={() => setReceipt(null)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: '#18242066' }} activeOpacity={1} onPress={() => setReceipt(null)} />
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 26 }}>
          <Micro color={C.gold}>RECEIPT · {receipt?.id}</Micro>
          <Text style={[S.mut, { marginTop: 6 }]}>{receipt?.pickup_addr} → {receipt?.drop_addr}</Text>
          {receipt?.fare_breakdown && Object.entries(receipt.fare_breakdown).map(([k, v]) => {
            if (k === 'surge_multiplier' || (!v && !['base_fare', 'gst'].includes(k))) return null;
            return (
              <View key={k} style={[S.row, { justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: C.hair }]}>
                <Text style={[S.body, { textTransform: 'capitalize' }]}>{k.replace(/_/g, ' ')}</Text>
                <Text style={{ fontFamily: F.uiBold, color: v < 0 ? C.emerald : C.ink }}>{v < 0 ? '−' : ''}{inr(Math.abs(v))}</Text>
              </View>
            );
          })}
          {receipt?.promo_discount > 0 && (
            <View style={[S.row, { justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: C.hair }]}>
              <Text style={S.body}>Promo ({receipt.promo_code})</Text>
              <Text style={{ fontFamily: F.uiBold, color: C.emerald }}>−{inr(receipt.promo_discount)}</Text>
            </View>
          )}
          <View style={[S.row, { justifyContent: 'space-between', paddingTop: 14 }]}>
            <Text style={S.h3}>Paid via {receipt?.payment_method}</Text>
            <Text style={{ fontFamily: F.uiHeavy, fontSize: 22, color: C.emerald }}>{inr(receipt?.fare_final)}</Text>
          </View>
          {receipt?.is_corporate ? <Pill text={`CORPORATE${receipt.expense_code ? ' · ' + receipt.expense_code : ''}`} tone="vi" style={{ marginTop: 12 }} /> : null}
          <Btn title="Done" kind="soft" onPress={() => setReceipt(null)} style={{ marginTop: 18 }} />
        </View>
      </Modal>
    </ScrollView>
  );
}

/* =====================================================================
   WALLET (+ Prime)
===================================================================== */
function WalletScreen() {
  const [w, setW] = useState(null);
  const [me, setMe] = useState(null);

  const load = useCallback(async () => {
    setW(await api.get('/api/wallet'));
    setMe((await api.get('/api/me')).user);
  }, []);
  usePoll(load, 6000);

  const topup = async (amt) => {
    try { await api.post('/api/wallet/topup', { amount: amt }); toast(`${inr(amt)} added`); load(); }
    catch (e) { toast(e.message, true); }
  };
  const joinPrime = async () => {
    try { await api.post('/api/prime/subscribe'); toast('Welcome to Ryder Prime ✦ Zero surge, 10% off'); load(); }
    catch (e) { toast(e.message, true); }
  };
  const activatePostpaid = async () => {
    try { await api.post('/api/postpaid/activate'); toast('Ryder Postpaid active — ride now, settle later'); load(); }
    catch (e) { toast(e.message, true); }
  };

  const IC = { topup: '＋', ride_charge: '⌖', ride_earning: '◈', promo_credit: '✦', refund: '↺', tip: '♥', referral: '🤝', prime: '✦' };
  const isPrime = me && (me.prime_until || 0) > Date.now();

  return (
    <ScrollView style={S.screen} contentContainerStyle={{ padding: 22, paddingBottom: 34 }}>
      <Text style={S.h1}>Wallet<Text style={S.serif}>.</Text></Text>

      <View style={[{ marginTop: 16, padding: 24, borderRadius: R.lg, backgroundColor: C.emerald, overflow: 'hidden' }, shadow.float]}>
        <View style={{ position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: '#FFFFFF1A', top: -70, right: -50 }} />
        <View style={{ position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#FFFFFF12', bottom: -50, left: -30 }} />
        <Micro color="#C7CDFF">RYDER CASH</Micro>
        <Text style={{ fontFamily: F.uiHeavy, fontSize: 44, color: C.white, marginTop: 6, letterSpacing: -1 }}>{inr(w?.balance)}</Text>
        <View style={[S.row, { gap: 9, marginTop: 16 }]}>
          {[100, 250, 500].map(a => (
            <TouchableOpacity key={a} onPress={() => topup(a)} style={{
              flex: 1, backgroundColor: '#FFFFFF22', borderRadius: 999, paddingVertical: 12, alignItems: 'center',
            }}>
              <Text style={{ fontFamily: F.uiHeavy, fontSize: 13, color: C.white }}>+ ₹{a}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[S.card, { marginTop: 14, padding: 20, backgroundColor: C.goldSoft, borderColor: '#E8DCC0' }]}>
        <View style={[S.row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[S.h3, { color: C.gold }]}>Ryder Prime ✦</Text>
            <Text style={[S.mut, { marginTop: 4 }]}>
              {isPrime ? `Member until ${new Date(me.prime_until).toLocaleDateString('en-IN')}` : 'Zero surge · 10% off every ride · ₹149/mo'}
            </Text>
          </View>
          {!isPrime && <Btn title="Join" kind="gold" small onPress={joinPrime} />}
          {isPrime && <Pill text="ACTIVE" tone="gold" />}
        </View>
      </View>

      <View style={[S.card, { marginTop: 14, padding: 20, backgroundColor: C.violetSoft, borderColor: '#DCD6F2' }]}>
        <View style={[S.row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[S.h3, { color: C.violet }]}>Ryder Postpaid</Text>
            <Text style={[S.mut, { marginTop: 4 }]}>
              {me?.postpaid_limit > 0
                ? `₹${me.postpaid_limit} credit line active — balance can dip below zero, settle any time`
                : 'Ride now, settle later — ₹500 credit line after your first ride'}
            </Text>
          </View>
          {me?.postpaid_limit > 0
            ? <Pill text="ACTIVE" tone="vi" />
            : <Btn title="Activate" kind="dark" small onPress={activatePostpaid} />}
        </View>
      </View>

      <Micro style={{ marginTop: 22 }}>TRANSACTIONS</Micro>
      {w?.transactions.map(t => (
        <View key={t.id} style={[S.row, { paddingVertical: 13, borderBottomWidth: 1, borderColor: C.hair, gap: 13 }]}>
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.sand, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.gold }}>{IC[t.type] || '·'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[S.h3, { fontSize: 13.5 }]} numberOfLines={1}>{t.note || t.type}</Text>
            <Text style={S.mut}>{timeAgo(t.created_at)}</Text>
          </View>
          <Text style={{ fontFamily: F.uiBold, fontSize: 14.5, color: t.amount >= 0 ? C.emerald : C.ink }}>
            {t.amount >= 0 ? '+' : ''}{inr(t.amount)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

/* =====================================================================
   PROFILE (referral, saved places, emergency contacts, support)
===================================================================== */
const PREF_LABELS = {
  quiet: '🤫 Quiet rides', ac: '❄ AC on, always', luggage_help: '🧳 Help with luggage',
  prefer_woman_driver: '👩 Prefer woman driver', auto_share: '📡 Auto-share night trips',
};

function ProfileScreen({ onSignOut }) {
  const [me, setMe] = useState(null);
  const [ref, setRef] = useState(null);
  const [saved, setSaved] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [prefs, setPrefs] = useState({});
  const [favs, setFavs] = useState([]);

  const load = useCallback(async () => {
    setMe((await api.get('/api/me')).user);
    setRef(await api.get('/api/referral'));
    setSaved(await api.get('/api/saved-places'));
    setContacts(await api.get('/api/emergency-contacts'));
    setPrefs(await api.get('/api/preferences'));
    setFavs(await api.get('/api/favourites'));
  }, []);
  useEffect(() => { load(); }, []);

  const togglePref = async (k) => {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    try { await api.post('/api/preferences', next); }
    catch (e) { toast(e.message, true); }
  };

  const saveHome = async (label) => {
    const p = label === 'home'
      ? { label, name: 'Indiranagar 100 Ft Rd', lat: 12.9719, lng: 77.6412 }
      : { label, name: 'Koramangala 5th Block', lat: 12.9345, lng: 77.6192 };
    await api.post('/api/saved-places', p);
    toast(`${label} saved`); load();
  };
  const addContact = async () => {
    if (!cName || !cPhone) return toast('Name and phone needed', true);
    try { await api.post('/api/emergency-contacts', { name: cName, phone: cPhone });
      setCName(''); setCPhone(''); toast('Emergency contact added'); load(); }
    catch (e) { toast(e.message, true); }
  };
  const raiseTicket = async () => {
    try { await api.post('/api/tickets', { type: 'other', message: 'Need help with my account' });
      toast('Support ticket raised — our desk will reach out'); }
    catch (e) { toast(e.message, true); }
  };
  const shareCode = async () => {
    try { await Share.share({ message: `Join me on Ryder — use my code ${ref?.code} and we both get ₹100! 🚕` }); }
    catch { toast(`Your code: ${ref?.code}`); }
  };

  return (
    <ScrollView style={S.screen} contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
      <View style={{ alignItems: 'center', marginTop: 10 }}>
        <View style={{
          width: 82, height: 82, borderRadius: 41, backgroundColor: C.mint,
          borderWidth: 1, borderColor: C.mintDeep, alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontFamily: F.uiHeavy, fontSize: 26, color: C.emeraldDark }}>
            {(me?.name || '—').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <Text style={[S.h2, { marginTop: 12 }]}>{me?.name}</Text>
        <Text style={[S.mut, { marginTop: 4 }]}>★ {(me?.rating || 5).toFixed(2)} · {me?.rides_count || 0} rides · {me?.phone}</Text>
      </View>

      <View style={[S.card, { padding: 18, marginTop: 22, backgroundColor: C.violetSoft, borderColor: '#DCD6F2' }]}>
        <View style={[S.row, { justifyContent: 'space-between' }]}>
          <View>
            <Text style={[S.h3, { color: C.violet }]}>Refer & earn ₹100</Text>
            <Text style={[S.mut, { marginTop: 4 }]}>Code {ref?.code} · {ref?.referred ?? 0} friends joined</Text>
          </View>
          <Btn title="Share" kind="dark" small onPress={shareCode} />
        </View>
      </View>

      <View style={{ marginTop: 24, marginBottom: 22 }}>
        <SectionTitle><Text style={S.h3}>Ride preferences</Text></SectionTitle>
        <Text style={[S.mut, { marginBottom: 10 }]}>Shared with your driver on every trip. Woman-driver preference shapes matching when partners are nearby.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
          {Object.entries(PREF_LABELS).map(([k, label]) => {
            const on = !!prefs[k];
            return (
              <TouchableOpacity key={k} onPress={() => togglePref(k)}
                style={[S.card, { paddingVertical: 10, paddingHorizontal: 14, borderColor: on ? C.emerald : C.hair, backgroundColor: on ? C.mint : C.surface }]}>
                <Text style={{ fontFamily: F.uiBold, fontSize: 12, color: on ? C.emeraldDark : C.mut }}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {favs.length > 0 && (
        <View style={{ marginBottom: 22 }}>
          <SectionTitle><Text style={S.h3}>Favourite drivers</Text></SectionTitle>
          {favs.map(f => (
            <View key={f.driver_id} style={[S.row, { paddingVertical: 8, justifyContent: 'space-between' }]}>
              <Text style={S.body}>★ {f.name} · ★{(f.rating || 5).toFixed(2)} · {f.vehicle_make}</Text>
              <TouchableOpacity onPress={async () => { await api.post('/api/favourites', { driver_id: f.driver_id, remove: true }); load(); }}>
                <Text style={{ color: C.red, fontFamily: F.uiBold, fontSize: 12 }}>remove</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <SectionTitle right={null}><Text style={S.h3}>Saved places</Text></SectionTitle>
      <View style={[S.row, { gap: 9, flexWrap: 'wrap' }]}>
        {saved.map(sp => (
          <Pill key={sp.id} text={`${sp.label.toUpperCase()} · ${sp.name.split(',')[0]}`} tone="em" />
        ))}
        {!saved.find(s => s.label === 'home') && <Btn title="+ Set home" kind="soft" small onPress={() => saveHome('home')} />}
        {!saved.find(s => s.label === 'work') && <Btn title="+ Set work" kind="soft" small onPress={() => saveHome('work')} />}
      </View>

      <View style={{ marginTop: 24 }}>
        <SectionTitle><Text style={S.h3}>Emergency contacts</Text></SectionTitle>
        {contacts.map(ec => (
          <View key={ec.id} style={[S.row, { paddingVertical: 8, justifyContent: 'space-between' }]}>
            <Text style={S.body}>🛟 {ec.name} · {ec.phone}</Text>
            <TouchableOpacity onPress={async () => { await api.del('/api/emergency-contacts/' + ec.id); load(); }}>
              <Text style={{ color: C.red, fontFamily: F.uiBold, fontSize: 12 }}>remove</Text>
            </TouchableOpacity>
          </View>
        ))}
        <View style={[S.row, { gap: 9, marginTop: 8 }]}>
          <Input placeholder="Name" value={cName} onChangeText={setCName} style={{ flex: 1, paddingVertical: 11 }} />
          <Input placeholder="Phone" value={cPhone} onChangeText={setCPhone} keyboardType="phone-pad" style={{ flex: 1, paddingVertical: 11 }} />
        </View>
        <Btn title="Add contact" kind="soft" small onPress={addContact} style={{ marginTop: 9, alignSelf: 'flex-start' }} />
      </View>

      <View style={{ marginTop: 26, gap: 10 }}>
        <Btn title="🎧  Contact support" kind="ghost" onPress={raiseTicket} />
        <Btn title="Sign out" kind="danger" onPress={async () => { await setToken(null); onSignOut(); }} />
      </View>
    </ScrollView>
  );
}

/* =====================================================================
   NAVIGATION
===================================================================== */
function RideFlow() {
  return (
    <Stack.Navigator screenOptions={{
      headerShadowVisible: false,
      headerStyle: { backgroundColor: C.bg },
      headerTitleStyle: { fontFamily: F.uiBold, fontSize: 16, color: C.ink },
      headerTintColor: C.emerald,
      contentStyle: { backgroundColor: C.bg },
    }}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Destination' }} />
      <Stack.Screen name="Fare" component={FareScreen} options={{ title: 'Choose your ride' }} />
      <Stack.Screen name="Rentals" component={RentalsScreen} options={{ title: 'Rentals' }} />
      <Stack.Screen name="Outstation" component={OutstationScreen} options={{ title: 'Outstation' }} />
      <Stack.Screen name="Parcel" component={ParcelScreen} options={{ title: 'Send a parcel' }} />
      <Stack.Screen name="Ride" component={RideScreen} options={{ title: 'Your ride', headerBackVisible: false }} />
      <Stack.Screen name="Rate" component={RateScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

export default function RiderApp({ onSignOut }) {
  return (
    <Tabs.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.hair, height: 62, paddingBottom: 8, paddingTop: 6 },
      tabBarActiveTintColor: C.emerald,
      tabBarInactiveTintColor: C.mut,
      tabBarLabelStyle: { fontFamily: F.uiBold, fontSize: 10.5, letterSpacing: 0.6 },
      tabBarIcon: ({ color }) => (
        <Text style={{ fontSize: 17, color }}>
          {{ RideTab: '⌂', Trips: '≣', Wallet: '◈', You: '◌' }[route.name]}
        </Text>
      ),
    })}>
      <Tabs.Screen name="RideTab" component={RideFlow} options={{ title: 'Ride' }} />
      <Tabs.Screen name="Trips" component={TripsScreen} />
      <Tabs.Screen name="Wallet" component={WalletScreen} />
      <Tabs.Screen name="You">
        {() => <ProfileScreen onSignOut={onSignOut} />}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}
