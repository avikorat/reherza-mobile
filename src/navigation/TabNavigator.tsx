import React from 'react';
import { Platform, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';
import { fonts } from '../theme';
import type { TabParamList } from '../types';

import HomeScreen from '../screens/HomeScreen';
import PlayhouseScreen from '../screens/PlayhouseScreen';
import RehearseScreen from '../screens/RehearseScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<keyof TabParamList, keyof typeof Feather.glyphMap> = {
  Home: 'home',
  Playhouse: 'book',
  Rehearse: 'mic',
  Profile: 'user',
};

// The bar's own content — icon, label, breathing room — above whatever the
// device reserves for its home indicator.
const TAB_BAR_CONTENT_HEIGHT = 60;

export default function TabNavigator() {
  const { theme } = useTheme();
  // The bar floats over the screen (position: absolute), so it has to pad
  // itself past the home indicator. Reading the real inset rather than
  // assuming one keeps the labels off the indicator on a notched iPhone and
  // avoids 24pt of dead space on a device that has none.
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: theme.tabBar,
          borderTopColor: theme.border,
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          paddingTop: 10,
          paddingBottom: insets.bottom,
        },
        // The active tab is the one place the rail carries brand colour — the
        // palette guide lists "the active/selected tab" among the few surfaces
        // the brand may claim.
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 0.1 },
        // Android gets Material 3's active-indicator pill behind the icon; iOS
        // keeps the plain tinted glyph the tab bar convention expects.
        tabBarIcon: ({ color, focused }) =>
          Platform.OS === 'android' ? (
            <View
              style={{
                width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
                backgroundColor: focused ? theme.accentBg : 'transparent',
              }}
            >
              <Feather name={ICONS[route.name]} size={22} color={color} />
            </View>
          ) : (
            <Feather name={ICONS[route.name]} size={24} color={color} />
          ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Playhouse" component={PlayhouseScreen} />
      <Tab.Screen name="Rehearse" component={RehearseScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
