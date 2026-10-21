import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import { BackButton, ProgressBar } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { Billing, Usage } from '../api';
import {
  fonts,
  radii,
  palette,
  brandGradient,
  brandGradientLocations,
  diagonalStart,
  diagonalEnd,
} from '../theme';
import type { CreditStatus, RootStackParamList, Subscription, UsageInfo } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Billing'>;

export default function BillingScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [sub, setSub] = useState<Subscription | null | undefined>(undefined); // undefined = loading
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [credits, setCredits] = useState<CreditStatus | null>(null);

  const load = useCallback(() => {
    Billing.subscription().then(setSub).catch(() => setSub(null));
    Billing.credits().then(setCredits).catch(() => setCredits(null));
    Usage.me().then(setUsage).catch(() => {});
  }, []);
  useFocusEffect(load);

  // Purchases happen outside the app (see the Billing note in src/api), so the
  // only subscription action offered here is stopping one.
  const cancel = () => {
    Alert.alert(
      'Cancel subscription?',
      sub?.currentPeriodEnd
        ? `You keep your plan until ${new Date(sub.currentPeriodEnd).toLocaleDateString()}, then move to the free allowance.`
        : 'Your plan ends at the close of the current billing period.',
      [
        { text: 'Keep plan', style: 'cancel' },
        {
          text: 'Cancel subscription',
          style: 'destructive',
          onPress: async () => {
            try {
              await Billing.cancel(true);
              load();
            } catch (e) {
              Alert.alert('Could not cancel', e instanceof Error ? e.message : 'Unknown error');
            }
          },
        },
      ]
    );
  };

  const usagePct = usage && usage.charLimit ? Math.min(1, usage.charsUsed / usage.charLimit) : 0;
  const canCancel = !!sub && sub.status === 'active' && !sub.cancelAtPeriodEnd;

  return (
    <Screen padded={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40, gap: 16 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={[styles.h1, { color: theme.text }]}>Plan & usage</Text>
        </View>

        {/* Current plan card — the palette guide's "Gradient Hero Card": one of
            the few surfaces the brand sweep is reserved for, on the 135° angle
            that reads better across a rectangle. */}
        <LinearGradient
          colors={brandGradient}
          locations={brandGradientLocations}
          start={diagonalStart}
          end={diagonalEnd}
          style={styles.hero}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={styles.heroEyebrow}>CURRENT PLAN</Text>
              <Text style={styles.heroPlan}>
                {sub === undefined ? '…' : sub?.planDetails?.name || sub?.plan || 'Free'}
              </Text>
            </View>
          </View>
          <Text style={styles.heroMeta}>
            {sub?.currentPeriodEnd
              ? `${sub.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`
              : 'Free allowance · resets monthly'}
          </Text>
        </LinearGradient>

        {/* Credits */}
        {usage ? (
          <View style={{ gap: 9 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: theme.text }}>Voice credits</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>
                {usage.charsUsed.toLocaleString()} / {(usage.charLimit || 0).toLocaleString()} chars
              </Text>
            </View>
            <ProgressBar progress={usagePct} />
            <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: theme.muted }}>
              {usage.analysisLimit != null
                ? `${usage.analysesUsed} of ${usage.analysisLimit} delivery analyses used this month`
                : 'Unlimited delivery analyses'}
            </Text>
          </View>
        ) : null}

        {credits?.enabled && credits.balance.milli > 0 ? (
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: theme.text }}>Extra credits</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>
                {(credits.balance.milli / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} left
              </Text>
            </View>
            {credits.balance.expiresSoonestAt ? (
              <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: theme.muted }}>
                Next expiry {new Date(credits.balance.expiresSoonestAt).toLocaleDateString()}
              </Text>
            ) : null}
          </View>
        ) : null}

        {canCancel ? (
          <TouchableOpacity onPress={cancel} accessibilityRole="button" style={{ alignItems: 'center', minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: theme.muted }}>Cancel subscription</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 24, letterSpacing: -0.5 },
  hero: {
    borderRadius: radii.card,
    padding: 18,
    shadowColor: palette.blue,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  // Supporting copy on a gradient surface steps down in opacity rather than to
  // a grey that would fight the sweep (the web's `.grad-surface-sub`).
  heroEyebrow: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.85)' },
  heroPlan: { fontFamily: fonts.heavy, fontSize: 30, letterSpacing: -0.7, color: palette.white, marginTop: 4 },
  heroMeta: { fontFamily: fonts.regular, fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 16 },
});
