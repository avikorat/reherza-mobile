import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';
import { fonts } from '../theme';

// A bottom sheet standing in for the web's <select>.
export default function PickerSheet<T extends string>({
  open, title, options, value, onPick, onClose,
}: {
  open: boolean;
  title: string;
  options: Array<{ value: T; label: string }>;
  value?: T | null;
  onPick: (v: T) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 12 }]}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: theme.text, padding: 18, paddingBottom: 8 }}>{title}</Text>
        <ScrollView>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <TouchableOpacity
                key={o.value}
                onPress={() => { onPick(o.value); onClose(); }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.row, { borderTopColor: theme.divider }]}
              >
                <Text style={{ flex: 1, fontFamily: on ? fonts.bold : fonts.regular, fontSize: 14.5, color: on ? theme.accent : theme.text }}>{o.label}</Text>
                {on ? <Feather name="check" size={18} color={theme.accent} /> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' },
  sheet: { maxHeight: '70%', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: 18, borderTopWidth: 1 },
});
