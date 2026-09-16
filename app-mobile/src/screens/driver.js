// Driver partner experience — go online, receive offers, run trips, earnings.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Animated } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { api, usePoll, setToken } from '../api';
import { C, R, F, shadow, CATEGORY_META, inr, timeAgo } from '../theme';
import {
  S, Btn, Pill, Micro, toast, MapCanvas, MapMarker, DotMe, RouteDots,
  OtpInput, makeProjection, SectionTitle,
} from '../ui';

const Tabs = createBottomTabNavigator();

/* =====================================================================
   HOME — online toggle + offer modal + active trip
===================================================================== */
function DriveScreen() {
  const [me, setMe] = useState(null);
  const [drv, setDrv] = useState(null);
  const [sum, setSum] = useState(null);
  const [online, setOnline] = useState(false);
  const [offer, setOffer] = useState(null);
  const [offerLeft, setOfferLeft] = useState(15);
  const [trip, setTrip] = useState(null);
  const [otp, setOtp] = useState('');
  const offerTimer = useRef(null);

  const loadMe = useCallback(async () => {
    const r = await api.get('/api/me');
    setMe(r.user); setDrv(r.driver);
    setOnline(r.driver?.is_online === 1);
    setSum(await api.get('/api/driver/summary'));
  }, []);
  useEffect(() => { loadMe(); }, []);

  /* poll for the active trip */
  usePoll(async () => {
    const r = await api.get('/api/me');
    setDrv(r.driver);
    if (r.driver?.current_ride_id) {
      const t = await api.get('/api/rides/' + r.driver.current_ride_id);
      if (['ACCEPTED', 'ARRIVED', 'ONGOING'].includes(t.status)) setTrip(t);
      else { setTrip(null); setSum(await api.get('/api/driver/summary')); }
    } else if (trip) {
      setTrip(null); setSum(await api.get('/api/driver/summary'));
    }
  }, 2500, [trip?.id]);

  /* poll for offers while online and idle */
  usePoll(async () => {
    if (!online || trip || offer) return;
    const o = await api.get('/api/driver/offer');
    if (o) {
      setOffer(o); setOfferLeft(12);
      clearInterval(offerTimer.current);
      offerTimer.current = setInterval(() => setOfferLeft(s => {
        if (s <= 1) { clearInterval(offerTimer.current); setOffer(null); return 0; }
        return s - 1;
      }), 1000);
    }
  }, 2000, [online, !!trip, !!offer], true);

  const toggle = async () => {
    try {
      const r = await api.post('/api/driver/status', { online: !online });
      setOnline(r.online);
      toast(r.online ? 'You are online — watching for requests' : 'You are offline');
      setSum(await api.get('/api/driver/summary'));
    } catch (e) { toast(e.message, true); }
  };

  const toggleGoto = async () => {
    try {
      if (sum?.goto) {
        await api.post('/api/driver/goto', { clear: true });
        toast('GoTo mode off');
      } else {
        // demo destination: HSR — a real app drops a pin on the map
        const r = await api.post('/api/driver/goto', { lat: 12.9116, lng: 77.6474 });
        toast(`GoTo set for 2h — rides toward your pin get priority (${r.goto.uses_left_today} activation left today)`);
      }
      setSum(await api.get('/api/driver/summary'));
    } catch (e) { toast(e.message, true); }
  };

  const accept = async () => {
    clearInterval(offerTimer.current);
    try {
      const t = await api.post(`/api/driver/rides/${offer.id}/accept`);
      setOffer(null); setTrip(t);
      toast('Ride accepted — head to pickup');
    } catch (e) { toast(e.message, true); setOffer(null); }
  };
  const decline = async () => {
    clearInterval(offerTimer.current);
    try { await api.post(`/api/driver/rides/${offer.id}/decline`); } catch {}
    setOffer(null);
  };

  const arrived = async () => {
    try { setTrip(await api.post(`/api/driver/rides/${trip.id}/arrived`)); }
    catch (e) { toast(e.message, true); }
  };
  const start = async () => {
    if (otp.length < 4) return toast('Enter the 4-digit code', true);
    try { setTrip(await api.post(`/api/driver/rides/${trip.id}/start`, { otp })); setOtp(''); toast('Code verified — trip started'); }
    catch (e) { toast(e.message, true); }
  };
  const complete = async () => {
    try {
      const r = await api.post(`/api/driver/rides/${trip.id}/complete`);
      toast(`Trip complete — ${inr(Math.round(r.fare_final * 0.78))} added to earnings`);
      setTrip(null); loadMe();
    } catch (e) { toast(e.message, true); }
  };
  const cancelTrip = async () => {
    try { await api.post(`/api/rides/${trip.id}/cancel`, { reason: 'driver cancelled' }); setTrip(null); }
    catch (e) { toast(e.message, true); }
  };

  const kycTone = drv?.kyc_status === 'verified' ? 'em' : drv?.kyc_status === 'pending' ? 'amber' : 'red';

  /* -------- trip view -------- */
  if (trip) {
    const proj = makeProjection([
      { lat: trip.pickup_lat, lng: trip.pickup_lng }, { lat: trip.drop_lat, lng: trip.drop_lng },
    ]);
    const a = proj(trip.pickup_lat, trip.pickup_lng), b = proj(trip.drop_lat, trip.drop_lng);
    return (
      <ScrollView style={S.screen} contentContainerStyle={{ padding: 22, paddingBottom: 34 }}>
        <View style={[S.row, { justifyContent: 'space-between' }]}>
          <Text style={S.h2}>Current <Text style={S.serif}>trip.</Text></Text>
          <Pill text={trip.status} tone="em" />
        </View>
        <MapCanvas height={210} style={{ marginTop: 14 }}>
          <RouteDots a={a} b={b} />
          <MapMarker x={a.x} y={a.y}><DotMe /></MapMarker>
          <MapMarker x={b.x} y={b.y}><Text style={{ fontSize: 18 }}>⚑</Text></MapMarker>
        </MapCanvas>

        <View style={[S.card, S.row, { padding: 16, marginTop: 14, gap: 14 }]}>
          <View style={{
            width: 46, height: 46, borderRadius: 23, backgroundColor: C.mint,
            alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.mintDeep,
          }}>
            <Text style={{ fontFamily: F.uiHeavy, fontSize: 15, color: C.emeraldDark }}>
              {(trip.rider_name || '—').split(' ').map(w => w[0]).join('').slice(0, 2)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={S.h3}>{trip.rider_name} · ★ {(trip.rider_rating || 5).toFixed(2)}</Text>
            <Text style={S.mut} numberOfLines={1}>{trip.pickup_addr} → {trip.drop_addr}</Text>
          </View>
          <Pill text={inr(trip.fare_quoted)} tone="gold" />
        </View>

        {trip.status === 'ACCEPTED' && <Btn title="I've arrived at pickup" onPress={arrived} style={{ marginTop: 18 }} />}
        {trip.status === 'ARRIVED' && (
          <View style={{ marginTop: 18, alignItems: 'center' }}>
            <Text style={[S.body, { marginBottom: 12 }]}>Ask the rider for their 4-digit code</Text>
            <OtpInput length={4} onChange={setOtp} />
            <Btn title="Verify & start trip" onPress={start} style={{ marginTop: 16, alignSelf: 'stretch' }} />
          </View>
        )}
        {trip.status === 'ONGOING' && (
          <View style={{ marginTop: 18, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.uiHeavy, fontSize: 38, color: C.ink }}>{inr(trip.fare_quoted)}</Text>
            <Text style={S.mut}>{trip.distance_km} km · collect via {trip.payment_method}</Text>
            <Btn title="End trip & collect" kind="gold" onPress={complete} style={{ marginTop: 16, alignSelf: 'stretch' }} />
          </View>
        )}
        {trip.status !== 'ONGOING' && <Btn title="Cancel trip" kind="ghost" onPress={cancelTrip} style={{ marginTop: 10 }} />}
      </ScrollView>
    );
  }

  /* -------- idle / online view -------- */
  return (
    <ScrollView style={S.screen} contentContainerStyle={{ padding: 22, paddingBottom: 34 }}>
      <View style={[S.row, { justifyContent: 'space-between' }]}>
        <View>
          <Micro color={C.gold}>RYDER PARTNER</Micro>
          <Text style={[S.h1, { marginTop: 6 }]}>Hey {me?.name?.split(' ')[0] || 'partner'}<Text style={S.serif}>.</Text></Text>
        </View>
        <Pill text={`KYC · ${(drv?.kyc_status || '—').toUpperCase()}`} tone={kycTone} />
      </View>

      <TouchableOpacity activeOpacity={0.9} onPress={toggle}
        style={[S.card, S.row, {
          padding: 20, marginTop: 18, justifyContent: 'space-between',
          backgroundColor: online ? C.mint : C.surface,
          borderColor: online ? C.mintDeep : C.hair,
        }]}>
        <View>
          <Text style={S.h3}>{online ? "You're online" : "You're offline"}</Text>
          <Text style={[S.mut, { marginTop: 3 }]}>
            {online ? 'Watching for requests near you…' : 'Tap to start receiving requests'}
          </Text>
        </View>
        <View style={{
          width: 58, height: 32, borderRadius: 999, padding: 3,
          backgroundColor: online ? C.emerald : C.hairDark,
          alignItems: online ? 'flex-end' : 'flex-start',
        }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.white, ...shadow.card }} />
        </View>
      </TouchableOpacity>

      <MapCanvas height={200} style={{ marginTop: 14 }}>
        <MapMarker x={48} y={52}><DotMe /></MapMarker>
        <View style={{
          position: 'absolute', top: 12, left: 12, backgroundColor: C.white, borderRadius: 999,
          paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: C.hair, ...shadow.card,
        }}>
          <Text style={{ fontFamily: F.uiBold, fontSize: 11.5, color: C.inkSoft }}>Bengaluru · South fleet</Text>
        </View>
      </MapCanvas>

      <View style={[S.row, { gap: 10, marginTop: 14 }]}>
        {[
          [inr(sum?.today?.earnings ?? 0), 'today'],
          [String(sum?.today?.trips ?? 0), 'trips'],
          [`★ ${(sum?.rating ?? 5).toFixed(2)}`, 'rating'],
        ].map(([v, l]) => (
          <View key={l} style={[S.card, { flex: 1, padding: 16, alignItems: 'center' }]}>
            <Text style={{ fontFamily: F.uiHeavy, fontSize: 18, color: C.ink }}>{v}</Text>
            <Micro style={{ marginTop: 4 }}>{l}</Micro>
          </View>
        ))}
      </View>

      {sum?.fatigue_alert && (
        <View style={[S.card, S.row, { marginTop: 14, padding: 16, gap: 12, backgroundColor: C.amberSoft, borderColor: '#EEDDBB' }]}>
          <Text style={{ fontSize: 18 }}>😴</Text>
          <Text style={[S.body, { flex: 1, fontSize: 13 }]}>
            You've been online {sum.hours_online}h today. A short break keeps you and your riders safe.
          </Text>
        </View>
      )}

      <TouchableOpacity activeOpacity={0.9} onPress={toggleGoto}
        style={[S.card, S.row, {
          marginTop: 14, padding: 16, gap: 12,
          backgroundColor: sum?.goto ? C.mint : C.surface,
          borderColor: sum?.goto ? C.mintDeep : C.hair,
        }]}>
        <Text style={{ fontSize: 18 }}>🧭</Text>
        <View style={{ flex: 1 }}>
          <Text style={S.h3}>GoTo destination {sum?.goto ? '· ON' : ''}</Text>
          <Text style={[S.mut, { marginTop: 2 }]}>
            {sum?.goto
              ? 'Rides dropping near your pin get priority · tap to turn off'
              : 'Heading somewhere? Get rides that take you toward it · 2×/day'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* offer modal */}
      <Modal visible={!!offer} transparent animationType="slide" onRequestClose={decline}>
        <View style={{ flex: 1, backgroundColor: '#18242088', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: C.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30,
            padding: 26, paddingBottom: 36, borderTopWidth: 3, borderColor: C.emerald,
          }}>
            <View style={[S.row, { justifyContent: 'space-between' }]}>
              <Text style={S.h2}>New request</Text>
              <View style={{
                width: 48, height: 48, borderRadius: 24, backgroundColor: C.mint,
                alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.emerald,
              }}>
                <Text style={{ fontFamily: F.uiHeavy, fontSize: 17, color: C.emeraldDark }}>{offerLeft}</Text>
              </View>
            </View>
            <Text style={{ fontFamily: F.uiHeavy, fontSize: 44, color: C.ink, textAlign: 'center', marginVertical: 10 }}>
              {inr(offer?.fare_quoted)}
              {offer?.surge > 1 && <Text style={{ fontSize: 14, color: C.amber }}>  {offer.surge}× surge</Text>}
            </Text>
            <View style={[S.card, { padding: 16 }]}>
              <Text style={S.body}>● {offer?.pickup_addr}</Text>
              <Text style={[S.body, { marginTop: 6 }]}>⚑ {offer?.drop_addr} · {offer?.distance_km} km</Text>
              <Text style={[S.mut, { marginTop: 8 }]}>
                rider ★ {(offer?.rider_rating || 5).toFixed(1)} · pays via {offer?.payment_method} · {offer?.type}
              </Text>
            </View>
            <View style={[S.row, { gap: 12, marginTop: 18 }]}>
              <Btn title="Decline" kind="ghost" onPress={decline} style={{ flex: 1 }} />
              <Btn title="Accept ride" onPress={accept} style={{ flex: 2 }} />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

/* =====================================================================
   EARNINGS
===================================================================== */
function EarningsScreen() {
  const [sum, setSum] = useState(null);
  const [w, setW] = useState(null);
  usePoll(async () => {
    setSum(await api.get('/api/driver/summary'));
    setW(await api.get('/api/wallet'));
  }, 6000);

  return (
    <ScrollView style={S.screen} contentContainerStyle={{ padding: 22, paddingBottom: 34 }}>
      <Text style={S.h1}>Earnings<Text style={S.serif}>.</Text></Text>
      <View style={[S.card, { marginTop: 16, padding: 24, backgroundColor: C.emerald, borderColor: C.emeraldDark }]}>
        <Micro color="#BFE8D6">THIS WEEK</Micro>
        <Text style={{ fontFamily: F.uiHeavy, fontSize: 42, color: C.white, marginTop: 6 }}>
          {inr(sum?.week?.earnings ?? 0)}
        </Text>
        <Text style={{ fontFamily: F.ui, fontSize: 12.5, color: '#BFE8D6', marginTop: 4 }}>
          {sum?.week?.trips ?? 0} trips · balance {inr(sum?.balance ?? 0)} · acceptance {sum?.acceptance ?? 100}%
        </Text>
        <TouchableOpacity onPress={() => toast('Instant payout initiated — funds reach your bank in minutes')}
          style={{ backgroundColor: '#FFFFFF22', borderWidth: 1, borderColor: '#FFFFFF44', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 16 }}>
          <Text style={{ fontFamily: F.uiBold, fontSize: 13, color: C.white }}>⚡ Instant payout</Text>
        </TouchableOpacity>
      </View>

      <Micro style={{ marginTop: 22 }}>SETTLEMENTS</Micro>
      {w?.transactions.filter(t => t.amount > 0).map(t => (
        <View key={t.id} style={[S.row, { paddingVertical: 13, borderBottomWidth: 1, borderColor: C.hair, gap: 13 }]}>
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.emerald }}>◈</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[S.h3, { fontSize: 13.5 }]} numberOfLines={1}>{t.note || t.type}</Text>
            <Text style={S.mut}>{timeAgo(t.created_at)}</Text>
          </View>
          <Text style={{ fontFamily: F.uiBold, fontSize: 14.5, color: C.emerald }}>+{inr(t.amount)}</Text>
        </View>
      ))}
      {(!w || w.transactions.filter(t => t.amount > 0).length === 0) &&
        <Text style={[S.mut, { marginTop: 14 }]}>Complete trips to see settlements here.</Text>}
    </ScrollView>
  );
}

/* =====================================================================
   PROFILE
===================================================================== */
function DProfileScreen({ onSignOut }) {
  const [me, setMe] = useState(null);
  const [drv, setDrv] = useState(null);
  useEffect(() => { (async () => {
    const r = await api.get('/api/me'); setMe(r.user); setDrv(r.driver);
  })(); }, []);

  const meta = CATEGORY_META[drv?.category] || {};
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
        <Text style={[S.mut, { marginTop: 4 }]}>
          {meta.emoji} {drv?.vehicle_make} · {drv?.plate}
        </Text>
      </View>

      <View style={{ marginTop: 24, gap: 10 }}>
        <View style={[S.card, S.row, { padding: 16, justifyContent: 'space-between' }]}>
          <Text style={S.body}>🪪 Driving licence & KYC</Text>
          <Pill text={(drv?.kyc_status || '—').toUpperCase()}
            tone={drv?.kyc_status === 'verified' ? 'em' : 'amber'} />
        </View>
        <View style={[S.card, S.row, { padding: 16, justifyContent: 'space-between' }]}>
          <Text style={S.body}>⛨ Trip insurance</Text>
          <Pill text="COVERED" tone="em" />
        </View>
        <View style={[S.card, S.row, { padding: 16, justifyContent: 'space-between' }]}>
          <Text style={S.body}>🏦 Daily settlement · instant on demand</Text>
        </View>
        <Btn title="Sign out" kind="danger" onPress={async () => { await setToken(null); onSignOut(); }} style={{ marginTop: 12 }} />
      </View>
    </ScrollView>
  );
}

export default function DriverApp({ onSignOut }) {
  return (
    <Tabs.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.hair, height: 62, paddingBottom: 8, paddingTop: 6 },
      tabBarActiveTintColor: C.emerald,
      tabBarInactiveTintColor: C.mut,
      tabBarLabelStyle: { fontFamily: F.uiBold, fontSize: 10.5, letterSpacing: 0.6 },
      tabBarIcon: ({ color }) => (
        <Text style={{ fontSize: 17, color }}>
          {{ Drive: '⌂', Earnings: '◈', Profile: '◌' }[route.name]}
        </Text>
      ),
    })}>
      <Tabs.Screen name="Drive" component={DriveScreen} />
      <Tabs.Screen name="Earnings" component={EarningsScreen} />
      <Tabs.Screen name="Profile">
        {() => <DProfileScreen onSignOut={onSignOut} />}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}
