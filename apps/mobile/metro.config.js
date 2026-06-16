// ============================================================
// apps/mobile/metro.config.js
// Expo SDK 52 + pnpm workspace — resolve monorepo packages
// ============================================================

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch monorepo packages (so changes rebuild)
config.watchFolders = [
  path.resolve(workspaceRoot, 'packages'),
];

// 2. Resolve node_modules from workspace root (pnpm hoisting)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Handle workspace symlinks — Metro needs to follow them
config.resolver.resolverMainFields = [
  'react-native',
  'browser',
  'main',
];

// 4. Keep source extensions
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  // Ensure ts/tsx handled
];

module.exports = config;
