import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeContext';
import { ProgressBar } from './Bits';
import { parseProgressPercent, parseProgressStage } from '../lib/format';
import { useReduceMotion } from '../lib/motion';
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

// The brand-gradient fill with the web's shimmer sweeping across it, so a
// slow parse still reads as working. Reduce Motion drops the sweep.
function Bar({ pct, height }: { pct: number; height: number }) {
  const { theme } = useTheme();
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion || !width) return;
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, width, sweep]);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Parsing your script"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flex: 1 }}
    >
      <ProgressBar progress={pct / 100} height={height} track={theme.accentBg} />
      {width && !reduceMotion ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { width: `${pct}%`, borderRadius: height / 2, overflow: 'hidden' }]}>
          <Animated.View
            style={{
              width: 40, height: '100%', backgroundColor: 'rgba(255,255,255,0.35)',
              transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-40, width] }) }],
            }}
          />
        </View>
      ) : null}
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
