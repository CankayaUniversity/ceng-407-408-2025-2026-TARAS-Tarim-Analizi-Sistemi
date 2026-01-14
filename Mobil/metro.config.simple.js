// Simple Metro configuration for Windows compatibility
// This is a backup/fallback configuration if the main one has issues

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Get project root with proper Windows path handling
const projectRoot = __dirname;

// Start with Expo's default config
const config = getDefaultConfig(projectRoot);

// SVG Support - Allow importing SVG files as React components
const svgTransformer = require.resolve('react-native-svg-transformer');

config.transformer = {
  ...config.transformer,
  babelTransformerPath: svgTransformer,
};

// Configure which file extensions to handle
config.resolver = {
  ...config.resolver,
  // Remove 'svg' from asset extensions
  assetExts: config.resolver.assetExts.filter(ext => ext !== 'svg'),
  // Add 'svg' to source extensions
  sourceExts: [...config.resolver.sourceExts, 'svg'],
};

// Export without NativeWind wrapper for testing
module.exports = config;
