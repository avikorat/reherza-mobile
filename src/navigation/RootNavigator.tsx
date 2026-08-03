import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../AuthContext';
import type { RootStackParamList } from '../types';
import TabNavigator from './TabNavigator';
import SignInScreen from '../screens/SignInScreen';
import CreateAccountScreen from '../screens/CreateAccountScreen';
import VerifyEmailScreen from '../screens/VerifyEmailScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import NewScriptScreen from '../screens/NewScriptScreen';
import ParsingScreen from '../screens/ParsingScreen';
import ScriptDetailScreen from '../screens/ScriptDetailScreen';
import ScriptEditorScreen from '../screens/ScriptEditorScreen';
import RehearsalRoomScreen from '../screens/RehearsalRoomScreen';
import StudioScreen from '../screens/StudioScreen';
import TakeReviewScreen from '../screens/TakeReviewScreen';
import SessionResultsScreen from '../screens/SessionResultsScreen';
import BillingScreen from '../screens/BillingScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { user } = useAuth();
  return (
    <Stack.Navigator
      initialRouteName={user ? 'Main' : 'SignIn'}
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
    >
      {/* Auth */}
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />

      {/* Main app */}
      <Stack.Screen name="Main" component={TabNavigator} />

      {/* Flow */}
      <Stack.Screen name="NewScript" component={NewScriptScreen} />
      <Stack.Screen name="Parsing" component={ParsingScreen} />
      <Stack.Screen name="ScriptDetail" component={ScriptDetailScreen} />
      <Stack.Screen name="ScriptEditor" component={ScriptEditorScreen} />
      <Stack.Screen name="SessionResults" component={SessionResultsScreen} />
      <Stack.Screen name="Billing" component={BillingScreen} />

      {/* Immersive (no gestures / full screen) */}
      <Stack.Group screenOptions={{ animation: 'fade', gestureEnabled: false }}>
        <Stack.Screen name="RehearsalRoom" component={RehearsalRoomScreen} />
        <Stack.Screen name="Studio" component={StudioScreen} />
        <Stack.Screen name="TakeReview" component={TakeReviewScreen} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
