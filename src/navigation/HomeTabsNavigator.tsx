import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import ProjectListScreen from '@/screens/ProjectListScreen';
import TrackListScreen from '@/screens/TrackListScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import DraftsScreen from '@/screens/DraftsScreen';
import NavigationBar from '@/components/features/navigation/NavigationBar';
import type { HomeTabsParamList } from './types';

const Tab = createBottomTabNavigator<HomeTabsParamList>();

export default function HomeTabsNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <NavigationBar {...props} />}
    >
      <Tab.Screen name="ProjectList" component={ProjectListScreen} />
      <Tab.Screen name="TrackList" component={TrackListScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Drafts" component={DraftsScreen} />
    </Tab.Navigator>
  );
}
