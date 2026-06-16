// ============================================================
// apps/mobile/index.js — Expo Entry Bridge
// Bypasses pnpm hoisting issues with expo/AppEntry resolution
// ============================================================

import { registerRootComponent } from 'expo';
import App from './App';

// Register the root component for Expo
registerRootComponent(App);
