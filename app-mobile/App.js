// Ryder — ride-hailing app (rider + driver partner in one codebase)
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { Fraunces_500Medium_Italic } from '@expo-google-fonts/fraunces';
import { api, loadToken, setToken } from './src/api';
import { C } from './src/theme';
import { ToastHost } from './src/ui';
import AuthScreen from './src/screens/auth';
import RiderApp from './src/screens/rider';
import DriverApp from './src/screens/driver';

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: C.bg, card: C.surface, primary: C.emerald, text: C.ink, border: C.hair },
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
    Fraunces_500Medium_Italic,
  });
  const [state, setState] = useState({ phase: 'loading', role: null }); // loading | auth | in

  const boot = useCallback(async () => {
    const t = await loadToken();
    if (!t) return setState({ phase: 'auth', role: null });
    try {
      const r = await api.get('/api/me');
      if (r.user.role === 'admin') {
        await setToken(null);
        return setState({ phase: 'auth', role: null });
      }
      setState({ phase: 'in', role: r.user.role });
    } catch {
      await setToken(null);
      setState({ phase: 'auth', role: null });
    }
  }, []);

  useEffect(() => { boot(); }, []);

  if (!fontsLoaded || state.phase === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.emerald} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      {state.phase === 'auth' ? (
        <AuthScreen onSignedIn={boot} />
      ) : (
        <NavigationContainer theme={navTheme}>
          {state.role === 'driver'
            ? <DriverApp onSignOut={() => setState({ phase: 'auth', role: null })} />
            : <RiderApp onSignOut={() => setState({ phase: 'auth', role: null })} />}
        </NavigationContainer>
      )}
      <ToastHost />
    </View>
  );
}
