import React, { memo, useMemo, useSyncExternalStore } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { wordDiff } from '../lib/rehearsal';

// What recognition has heard of the current line. Partials arrive several
// times a second; keeping them out of screen state means only the line
// re-renders, not the whole rehearsal or camera screen.
export function createSpokenStore() {
  let value = '';
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (v: string) => { if (v === value) return; value = v; subs.forEach((f) => f()); },
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  };
}
export type SpokenStore = ReturnType<typeof createSpokenStore>;

// A line that lights up word by word as speech recognition hears it — the
// web's live follow-along. Heard words take `heardColor`; the rest stay as
// styled. With nothing heard it renders exactly like plain text.
export default memo(function SpokenLine({ text, store, heardColor, style }: {
  text: string;
  store: SpokenStore;
  heardColor: string;
  style?: StyleProp<TextStyle>;
}) {
  const spoken = useSyncExternalStore(store.subscribe, store.get);
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
});
