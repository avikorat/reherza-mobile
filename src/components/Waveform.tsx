import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeContext';

// A stylised audio waveform (static bars). `variant`:
//  - "ai": tall multicolour bars (AI speaking)
//  - "user": accent input meter (your turn)
const AI_BARS = [20, 55, 85, 40, 100, 70, 95, 35, 65, 88, 45, 25, 60];
const AI_COLORS = ['#F5A623', '#F5A623', '#E0561B', '#F5A623', '#C21807', '#E0561B', '#C21807', '#F5A623', '#E0561B', '#C21807', '#F5A623', '#F5A623', '#E0561B'];

interface WaveformProps {
  variant?: 'ai' | 'user';
  height?: number;
}

export default function Waveform({ variant = 'ai', height = 56 }: WaveformProps) {
  const { theme } = useTheme();

  if (variant === 'user') {
    const bars = [30, 55, 80, 100, 70, 45, 60, 35, 25, 40, 20];
    return (
      <View style={[styles.row, { height: 34, gap: 3 }]}>
        {bars.map((h, i) => {
          const color = i < 5 ? theme.accent : i < 7 ? '#E0561B' : theme.border;
          return (
            <View
              key={i}
              style={{ width: 4, height: `${h}%`, backgroundColor: color, borderRadius: 2 }}
            />
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
          style={{ width: 5, height: `${h}%`, backgroundColor: AI_COLORS[i], borderRadius: 3 }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
});
