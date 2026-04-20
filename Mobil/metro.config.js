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
    // Android build artifacts — [/\\] matches both Windows backslash and Unix forward slash
    /[/\\]android[/\\]build[/\\]/,
    /[/\\]android[/\\]\.gradle[/\\]/,
    /[/\\]android[/\\]app[/\\]build[/\\]/,
    /[/\\]android[/\\][^/\\]*[/\\]intermediates[/\\]/,
    /[/\\]android[/\\][^/\\]*[/\\]merged_res[/\\]/,
    /[/\\]android[/\\][^/\\]*[/\\]incremental[/\\]/,
    /node_modules[/\\][^/\\]*[/\\]android[/\\]build[/\\]/,
    // iOS build artifacts
    /[/\\]ios[/\\]build[/\\]/,
    /[/\\]ios[/\\]Pods[/\\]/,
    /ios[/\\]\.xcode\.env\.local/,
    // Expo CLI state (project root only, not node_modules)
    /[/\\]\.expo[/\\]/,
    // NOTE: no /dist/ entry — too broad, breaks node_modules that ship compiled code in dist/
    // (react-native-css-interop, etc.)
  ],
};

// Configure watch folders (important for Windows)
config.watchFolders = [projectRoot];

// Cache temizleme — sadece RESET_METRO_CACHE=1 ile zorunlu, yoksa cache korunur
config.resetCache = process.env.RESET_METRO_CACHE === "1";

module.exports = withNativeWind(config, { input: './global.css' });
