import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';

// The web's `audioBar` keyframe: 3px → 18px → 3px, 0.8 s ease-in-out,
// staggered 120 ms per bar. It is THE listening / speaking indicator — the
// same motion for the partner's voice and your own mic, coloured by owner.
interface WaveformProps {
  color: string;
  bars?: number;
  /** Frozen at the resting height when false. */
  active?: boolean;
  min?: number;
  max?: number;
  width?: number;
}

export default function Waveform({ color, bars = 5, active = true, min = 3, max = 18, width = 3 }: WaveformProps) {
  const values = useRef(Array.from({ length: bars }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (!active) {
      values.forEach((v) => v.setValue(0));
      return;
    }
    const loops = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 120),
          Animated.timing(v, { toValue: 1, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(v, { toValue: 0, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, values]);

  return (
    <View style={[styles.row, { height: max, gap: width }]}>
      {values.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width,
            borderRadius: width,
            backgroundColor: color,
            height: v.interpolate({ inputRange: [0, 1], outputRange: [min, max] }),
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
