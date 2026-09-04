import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeContext';

// A stylised audio waveform (static bars). `variant` follows the teleprompter's
// line-ownership colours rather than a decorative palette, so the bars answer
// the same question the text does — whose turn is this?
//   - "ai":   the scene partner's cyan (--tp-partner)
//   - "user": your brand blue (--tp-you), trailing off into the track colour
const AI_BARS = [20, 55, 85, 40, 100, 70, 95, 35, 65, 88, 45, 25, 60];
const USER_BARS = [30, 55, 80, 100, 70, 45, 60, 35, 25, 40, 20];

interface WaveformProps {
  variant?: 'ai' | 'user';
  height?: number;
}

export default function Waveform({ variant = 'ai', height = 56 }: WaveformProps) {
  const { theme } = useTheme();

  if (variant === 'user') {
    return (
      <View style={[styles.row, { height: 34, gap: 3 }]}>
        {USER_BARS.map((h, i) => {
          // The live end of the meter is solid brand blue; past it the bars fall
          // back to the neutral track so the "level" reads without a legend.
          const color = i < 5 ? theme.tpYou : i < 7 ? theme.accent2Fill : theme.border;
          return (
            <View key={i} style={{ width: 4, height: `${h}%`, backgroundColor: color, borderRadius: 2 }} />
          );
        })}
      </View>
    );
  }

  return (
    <View style={[styles.row, { height, gap: 4 }]}>
      {AI_BARS.map((h, i) => (
        <View
          key={i}
          style={{
            width: 5,
            height: `${h}%`,
            // Alternate the two ends of the brand sweep so the block of bars
            // reads as the gradient without painting one.
            backgroundColor: i % 3 === 0 ? theme.accent : theme.accent2Fill,
            borderRadius: 3,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
});
