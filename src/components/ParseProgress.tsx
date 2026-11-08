import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../ThemeContext';
import { parseProgressPercent, parseProgressStage } from '../lib/format';
import { fonts } from '../theme';

// The web's ParseProgressBar: an estimate anchored to parseStartedAt, so the
// dashboard tile and the script page always show the same figure.
function useParseProgress(startedAt?: string | null): number {
  const [anchor] = useState(() => {
    const t = startedAt ? Date.parse(startedAt) : NaN;
    return Number.isFinite(t) ? t : Date.now();
  });
  const [pct, setPct] = useState(() => parseProgressPercent(anchor, Date.now()));
  useEffect(() => {
    const id = setInterval(() => setPct(parseProgressPercent(anchor, Date.now())), 250);
    return () => clearInterval(id);
  }, [anchor]);
  return pct;
}

function Bar({ pct, height }: { pct: number; height: number }) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Parsing your script"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={{ flex: 1, height, borderRadius: height / 2, backgroundColor: theme.accentBg, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: height / 2, backgroundColor: theme.accent }} />
    </View>
  );
}

export function MiniParseProgress({ startedAt }: { startedAt?: string | null }) {
  const { theme } = useTheme();
  const pct = useParseProgress(startedAt);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Bar pct={pct} height={6} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: theme.accent }}>{Math.round(pct)}%</Text>
    </View>
  );
}

export default function ParseProgress({ startedAt }: { startedAt?: string | null }) {
  const { theme } = useTheme();
  const pct = useParseProgress(startedAt);
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.accent }}>{parseProgressStage(pct)}…</Text>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.accent }}>{Math.round(pct)}%</Text>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 8 }}><Bar pct={pct} height={8} /></View>
      <Text style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: theme.muted, marginTop: 8 }}>
        This can take a minute or two. You can leave this screen — we'll keep working, and it updates on its own when it's ready.
      </Text>
    </View>
  );
}
