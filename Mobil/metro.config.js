const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

// Get the project root directory
const projectRoot = path.resolve(__dirname);

const config = getDefaultConfig(projectRoot);

// Add SVG transformer support
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
  minifierPath: 'metro-minify-terser',
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

// Configure asset and source extensions
config.resolver = {
  ...config.resolver,
  assetExts: (config.resolver.assetExts || []).filter(ext => ext !== 'svg'),
  sourceExts: [...(config.resolver.sourceExts || []), 'svg'],
  // Exclude build artifacts from resolution
  blockList: [
    // Android build artifacts
    /android\/build\/.*/,
    /android\/\.gradle\/.*/,
    /android\/app\/build\/.*/,
    /android\/.*\/intermediates\/.*/,
    /android\/.*\/merged_res\/.*/,
    // iOS build artifacts
    /ios\/build\/.*/,
    /ios\/Pods\/.*/,
    /ios\/\.xcode\.env\.local/,
    // Other build outputs
    /\.expo\/.*/,
    /dist\/.*/,
    /node_modules\/.*\/android\/build\/.*/,
  ],
};

// Configure watch folders (important for Windows)
config.watchFolders = [projectRoot];

// Reset cache configuration for better reliability
config.resetCache = true;

module.exports = withNativeWind(config, { input: './global.css' });
