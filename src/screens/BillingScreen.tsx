import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import GradientButton from '../components/GradientButton';
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
import type { Plan, RootStackParamList, Subscription, UsageInfo } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Billing'>;

function money(amount: number | undefined, currency: string | undefined): string {
  const v = (amount || 0) / 100;
  const sym = (currency || 'usd').toLowerCase() === 'usd' ? '$' : '';
  return `${sym}${v % 1 === 0 ? v : v.toFixed(2)}`;
}

interface PlanRowProps {
  plan: Plan;
  current?: boolean;
  onPick?: () => void;
  busy?: boolean;
}

function PlanRow({ plan, current, onPick, busy }: PlanRowProps) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={current || !plan.purchasable ? 1 : 0.8}
      onPress={current || !plan.purchasable ? undefined : onPick}
    >
      <View
        style={[
          styles.planRow,
          {
            backgroundColor: theme.surface,
            borderColor: current ? theme.accent : theme.border,
            borderWidth: 1,
            shadowColor: theme.shadow,
            shadowOpacity: 0.6,
          },
        ]}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: theme.text }}>{plan.name}</Text>
            {current ? (
              <View style={[styles.currentPill, { backgroundColor: theme.accentBg, borderColor: theme.accentRing }]}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 10, color: theme.accent }}>CURRENT</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted, marginTop: 2 }}>
            {plan.voiceCharacterLimit
              ? `${Math.round(plan.voiceCharacterLimit / 1000)}k voice chars · ${plan.analysisLimit ?? '∞'} analyses / mo`
              : (plan.features || []).join(' · ') || '—'}
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : (
          <Text style={{ fontFamily: current ? fonts.bold : fonts.regular, fontSize: 12, color: current ? theme.text : theme.muted }}>
            {money(plan.priceAmount, plan.currency)}/{plan.billingPeriod === 'year' ? 'yr' : 'mo'}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function BillingScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [sub, setSub] = useState<Subscription | null | undefined>(undefined); // undefined = loading
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      Billing.plans().then(setPlans).catch(() => setPlans([]));
      Billing.subscription().then(setSub).catch(() => setSub(null));
      Usage.me().then(setUsage).catch(() => {});
    }, [])
  );

  const currentPlanId = sub?.planId || null;

  const subscribe = async (plan: Plan) => {
    setBusyPlan(plan.id);
    try {
      if (currentPlanId) {
        await Billing.changePlan(plan.id);
        Alert.alert('Plan changed', `You're now on ${plan.name}.`);
        setSub(await Billing.subscription().catch(() => sub ?? null));
      } else {
        const { url } = await Billing.checkout(plan.id);
        await Linking.openURL(url);
      }
    } catch (e) {
      Alert.alert('Billing', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusyPlan(null);
    }
  };

  const openPortal = async () => {
    try {
      const { url } = await Billing.portal();
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Billing', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const usagePct = usage && usage.charLimit ? Math.min(1, usage.charsUsed / usage.charLimit) : 0;
  const upgradeTarget = (plans || []).find((p) => p.purchasable && p.id !== currentPlanId);

  return (
    <Screen padded={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40, gap: 16 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={[styles.h1, { color: theme.text }]}>Subscription</Text>
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
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.heroPrice}>
                {sub?.planDetails ? money(sub.planDetails.priceAmount, sub.planDetails.currency) : '$0'}
              </Text>
              <Text style={styles.heroPer}>per month</Text>
            </View>
          </View>
          <Text style={styles.heroMeta}>
            {sub?.currentPeriodEnd
              ? `${sub.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`
              : 'No card on file — upgrade any time'}
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

        {/* Plan picker */}
        <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.text }}>Change plan</Text>
        {plans === null ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {!currentPlanId ? (
              <PlanRow
                plan={{ id: 'free', name: 'Free', priceAmount: 0, currency: 'usd', billingPeriod: 'month', features: ['Starter limits'] }}
                current
              />
            ) : null}
            {plans.map((p) => (
              <PlanRow key={p.id} plan={p} current={p.id === currentPlanId} busy={busyPlan === p.id} onPick={() => void subscribe(p)} />
            ))}
          </View>
        )}

        {upgradeTarget ? (
          <GradientButton
            label={currentPlanId ? `Switch to ${upgradeTarget.name}` : `Upgrade to ${upgradeTarget.name}`}
            onPress={() => void subscribe(upgradeTarget)}
            style={{ marginTop: 4 }}
          />
        ) : null}
        <TouchableOpacity activeOpacity={0.7} onPress={() => void openPortal()}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: theme.muted, textAlign: 'center' }}>
            Manage payment method & invoices
          </Text>
        </TouchableOpacity>
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
  heroPrice: { fontFamily: fonts.heavy, fontSize: 26, letterSpacing: -0.6, color: palette.white },
  heroPer: { fontFamily: fonts.regular, fontSize: 11, color: 'rgba(255,255,255,0.85)' },
  heroMeta: { fontFamily: fonts.regular, fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 16 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radii.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  currentPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.control, borderWidth: 1 },
});
