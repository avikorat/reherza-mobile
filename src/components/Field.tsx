import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../ThemeContext';
import { fonts, radii } from '../theme';

interface FieldProps {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secure?: boolean;
  showToggle?: boolean;
  focused?: boolean;
  keyboardType?: KeyboardTypeOptions;
  style?: StyleProp<ViewStyle>;
}

// The web's `Input`: `rounded-md border border-input bg-card shadow-sm`, with a
// 1px brand-blue ring on focus (`focus-visible:ring-ring`).
export default function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  showToggle,
  focused: focusedProp,
  keyboardType,
  style,
}: FieldProps) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hide, setHide] = useState(Boolean(secure));
  const active = focusedProp ?? focused;

  return (
    <View style={style}>
      {label ? <Text style={[styles.label, { color: theme.muted }]}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          // Only the colour changes on focus. Toggling elevation / shadow (or
          // anything that re-lays-out the wrapper) on focus makes the new
          // architecture blur the input immediately and hop to the next field
          // (facebook/react-native#45798).
          { backgroundColor: theme.surface, borderColor: active ? theme.accent : theme.border },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.muted}
          secureTextEntry={hide}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, { color: theme.text }]}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType={secure ? 'password' : keyboardType === 'email-address' ? 'emailAddress' : undefined}
          accessibilityLabel={label || placeholder}
        />
        {showToggle ? (
          <TouchableOpacity
            onPress={() => setHide((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hide ? 'Show password' : 'Hide password'}
          >
            <Text style={[styles.toggle, { color: theme.muted }]}>{hide ? 'Show' : 'Hide'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.9,
    marginBottom: 7,
  },
  field: {
    borderRadius: radii.field,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 15, paddingVertical: 12 },
  toggle: { fontFamily: fonts.semibold, fontSize: 13 },
});
