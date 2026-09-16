// Sign-in: phone → OTP → (name, referral) — creates rider or driver accounts
import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { api, setToken } from '../api';
import { C, F } from '../theme';
import { S, Btn, Input, Micro, OtpInput, Pill, toast } from '../ui';

export default function AuthScreen({ onSignedIn }) {
  const [step, setStep] = useState('phone');   // phone | otp
  const [role, setRole] = useState('rider');
  const [phone, setPhone] = useState('+91');
  const [name, setName] = useState('');
  const [referral, setReferral] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [busy, setBusy] = useState(false);

  const sendOtp = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/auth/otp', { phone: phone.replace(/\s/g, '') });
      setDevOtp(r.demo_otp);
      setStep('otp');
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };

  const verify = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/auth/verify', {
        phone: phone.replace(/\s/g, ''), otp,
        name: name || undefined, role,
        referral: referral || undefined,
      });
      await setToken(r.token);
      onSignedIn();
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={S.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 30 }}>
        <View style={{
          width: 58, height: 58, borderRadius: 20, backgroundColor: C.emerald,
          alignItems: 'center', justifyContent: 'center', marginBottom: 26,
        }}>
          <Text style={{ fontFamily: F.uiHeavy, fontSize: 24, color: C.white }}>R</Text>
        </View>
        <Micro color={C.gold}>WELCOME TO RYDER</Micro>
        <Text style={[S.h1, { fontSize: 40, marginTop: 12 }]}>
          Go places,{'\n'}<Text style={[S.serif, { fontSize: 40 }]}>joyfully.</Text>
        </Text>
        <Text style={[S.body, { marginTop: 14, marginBottom: 30 }]}>
          {role === 'rider'
            ? 'Sign in with your phone. New accounts start with ₹500 of welcome credit.'
            : 'Partner sign-in. New partners start with a pending-KYC profile — approval happens in the ops console.'}
        </Text>

        {/* role toggle */}
        <View style={[S.row, { backgroundColor: C.sand, borderRadius: 999, padding: 4, marginBottom: 22 }]}>
          {['rider', 'driver'].map(r => (
            <TouchableOpacity key={r} onPress={() => setRole(r)} style={{
              flex: 1, paddingVertical: 11, borderRadius: 999, alignItems: 'center',
              backgroundColor: role === r ? C.white : 'transparent',
              borderWidth: role === r ? 1 : 0, borderColor: C.hairDark,
            }}>
              <Text style={{
                fontFamily: F.uiBold, fontSize: 13,
                color: role === r ? C.emeraldDark : C.mut, letterSpacing: 0.6,
              }}>
                {r === 'rider' ? 'I need a ride' : 'I drive'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {step === 'phone' ? (
          <>
            <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91 phone number" />
            <Btn title={busy ? 'Sending…' : 'Continue'} onPress={sendOtp} disabled={busy} style={{ marginTop: 14 }} />
            {role === 'driver' && (
              <Text style={[S.mut, { textAlign: 'center', marginTop: 18 }]}>
                Demo fleet driver: +919000000010 (Ramesh, verified)
              </Text>
            )}
          </>
        ) : (
          <>
            <Input value={name} onChangeText={setName} placeholder="Your name" style={{ marginBottom: 12 }} />
            {role === 'rider' && (
              <Input value={referral} onChangeText={setReferral} placeholder="Referral code (optional)"
                autoCapitalize="characters" style={{ marginBottom: 16 }} />
            )}
            <OtpInput length={6} onChange={setOtp} />
            <View style={{ alignItems: 'center', marginVertical: 14 }}>
              <Pill text={`DEV OTP · ${devOtp} (SMS gateway not wired)`} tone="gold" />
            </View>
            <Btn title={busy ? 'Verifying…' : 'Verify & enter'} onPress={verify} disabled={busy || otp.length < 6} />
            <Btn title="Different number" kind="ghost" onPress={() => setStep('phone')} style={{ marginTop: 10 }} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
