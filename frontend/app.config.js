// app.config.js - Dynamic Expo config that takes precedence over app.json
// This ensures the Android package name cannot be overridden by build pipelines
const baseConfig = require('./app.json');

const ANDROID_PACKAGE = 'in.perfectlygood.android';

module.exports = ({ config }) => {
  // Merge base config from app.json with forced overrides
  const mergedPlugins = [
    ...(baseConfig.expo.plugins || []),
    './plugins/withAndroidPackageName',
  ];

  const finalConfig = {
    ...baseConfig.expo,
    ...config,
    android: {
      ...baseConfig.expo.android,
      ...config.android,
      // Force the Android package name - this MUST be in.perfectlygood.android
      package: ANDROID_PACKAGE,
    },
    plugins: mergedPlugins,
  };

  return finalConfig;
};
