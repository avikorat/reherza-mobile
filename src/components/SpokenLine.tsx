import React, { useMemo } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { wordDiff } from '../lib/rehearsal';

// A line that lights up word by word as speech recognition hears it — the
// web's live follow-along. Heard words take `heardColor`; the rest stay as
// styled. With nothing heard it renders exactly like plain text.
export default function SpokenLine({ text, spoken, heardColor, style }: {
  text: string;
  spoken: string;
  heardColor: string;
  style?: StyleProp<TextStyle>;
}) {
  const words = useMemo(() => (spoken.trim() ? wordDiff(text, spoken).words : null), [text, spoken]);
  if (!words) return <Text style={style}>{text}</Text>;
  return (
    <Text style={style}>
      {words.map((w, i) => (
        <Text key={i} style={w.status !== 'missing' ? { color: heardColor } : undefined}>
          {i ? ' ' : ''}{w.text}
        </Text>
      ))}
    </Text>
  );
}
