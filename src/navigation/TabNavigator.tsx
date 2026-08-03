import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
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

export default function TabNavigator() {
  const { theme } = useTheme();
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
          height: 84,
          paddingTop: 10,
          paddingBottom: 24,
        },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 10 },
        tabBarIcon: ({ color }) => <Feather name={ICONS[route.name]} size={24} color={color} />,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Playhouse" component={PlayhouseScreen} />
      <Tab.Screen name="Rehearse" component={RehearseScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
