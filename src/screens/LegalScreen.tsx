import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import OutlineButton from '../components/OutlineButton';
import { BackButton } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { LEGAL_DOCUMENTS, type LegalDocument } from '../legal';
import { WEB_URL } from '../config';
import { fonts } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Legal'>;

// One legal document, read from the website rather than bundled — see
// src/legal.ts for why the text is not duplicated into this repo. That keeps
// one approved copy of the wording, but it means this screen needs a
// connection, so the failure state offers the system browser as a way out.
//
// There is deliberately no index screen. Every document is reached directly:
// by its own link in the signup consent line, or its own row in Profile. An
// index would be a list whose only job is to open another list.
export default function LegalScreen({ navigation, route }: Props) {
  const doc = LEGAL_DOCUMENTS.find((d) => d.id === route.params.docId);
  const { theme } = useTheme();

  // A bad id can only come from a stale deep link or a document pulled from the
  // registry. Say so and offer the way out rather than rendering a blank frame.
  if (!doc) {
    return (
      <Screen>
        <View style={styles.fallback}>
          <Feather name="file-text" size={32} color={theme.muted} />
          <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: theme.text }}>
            Document not found
          </Text>
          <OutlineButton label="Go back" small onPress={() => navigation.goBack()} />
        </View>
      </Screen>
    );
  }

  return <Reader doc={doc} onBack={() => navigation.goBack()} />;
}

function Reader({ doc, onBack }: { doc: LegalDocument; onBack: () => void }) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const url = `${WEB_URL}${doc.path}`;

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.docTitle, { color: theme.text }]} numberOfLines={1}>
            {doc.title}
          </Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: theme.muted }}>
            Version {doc.version}
          </Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {failed ? (
        <View style={styles.fallback}>
          <Feather name="wifi-off" size={32} color={theme.muted} />
          <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: theme.text }}>
            Couldn't load this document
          </Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: theme.muted, textAlign: 'center' }}>
            Reherza reads the current version from reherza.com, so this needs a
            connection. Check your network and try again.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <OutlineButton
              icon="refresh-cw"
              label="Try again"
              small
              onPress={() => {
                setFailed(false);
                setLoading(true);
              }}
            />
            <OutlineButton
              secondary
              icon="external-link"
              label="Open in browser"
              small
              onPress={() => Linking.openURL(url).catch(() => {})}
            />
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            source={{ uri: url }}
            style={{ flex: 1, backgroundColor: theme.bg }}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
            // A legal document is a document — it should not be able to navigate
            // the user somewhere else in-app. Taps that leave the document open
            // in the system browser instead.
            onShouldStartLoadWithRequest={(req) => {
              if (req.url === url || req.url.startsWith(`${url}#`)) return true;
              Linking.openURL(req.url).catch(() => {});
              return false;
            }}
          />
          {loading ? (
            <View style={[styles.loading, { backgroundColor: theme.bg }]}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, paddingHorizontal: 24, paddingVertical: 8,
  },
  docTitle: { fontFamily: fonts.bold, fontSize: 15, letterSpacing: -0.2 },
  fallback: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 10,
  },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
