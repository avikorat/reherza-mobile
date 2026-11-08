import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../ThemeContext';
import { creditsLabel, formatCredits } from '../lib/format';
import { fonts, radii } from '../theme';
import type { UsageInfo } from '../types';

// The web's UsageMeter: a quiet line while credits are healthy, a tinted card
// at ≤20% left, on purchased credits, or exhausted. Copy is the web's
// billing-locked variant — the app never points at an upgrade (store rules).
export default function UsageMeter({ usage }: { usage: UsageInfo | null }) {
  const { theme } = useTheme();
  if (!usage || usage.creditsRemainingMilli === undefined) return null;
  const remaining = usage.creditsRemainingMilli;
  const plan = usage.creditLimitMilli ?? 0;
  const purchased = usage.purchasedMilli ?? 0;
  const exhausted = usage.creditsExhausted ?? remaining <= 0;
  const share = plan > 0 ? remaining / plan : 0;
  const warning = !exhausted && share <= 0.2;
  const onPurchased = !exhausted && purchased > 0 && remaining <= purchased;

  if (!warning && !exhausted && !onPurchased) {
    return (
      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>
        {creditsLabel(remaining)} left of {formatCredits(plan)} this month
        {purchased > 0 ? ` · plus ${creditsLabel(purchased)} purchased` : ''}
      </Text>
    );
  }

  const fg = exhausted ? theme.destructive : theme.warning;
  const percent = exhausted ? 1 : Math.min(1, Math.max(0, 1 - share));
  return (
    <View accessibilityRole="summary" style={{ borderRadius: radii.card, borderWidth: 1, borderColor: fg, backgroundColor: exhausted ? theme.destructiveBg : theme.warningBg, paddingHorizontal: 16, paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 13.5, color: fg }}>
          {onPurchased ? "You're on purchased credits" : exhausted ? "You've used all of this month's credits" : `${creditsLabel(remaining)} left this month`}
        </Text>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: fg }}>{formatCredits(remaining)}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${percent * 100}%`, backgroundColor: exhausted ? theme.destructive : theme.warningFill }} />
      </View>
      <Text style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: fg, marginTop: 9 }}>
        {onPurchased
          ? `This month's plan allowance is used up — you're now rehearsing on your ${creditsLabel(purchased)}.`
          : exhausted
            ? 'You can still rehearse your existing scripts, but adding new ones and end-of-session scoring are paused until next month.'
            : 'Each credit covers one page of script — its voices and its first analysis included.'}
      </Text>
    </View>
  );
}
