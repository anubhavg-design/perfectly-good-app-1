// plugins/withAndroidPackageName.js
// Expo config plugin that forces the Android package name at native generation time
const { withAndroidManifest } = require('@expo/config-plugins');

const FORCED_PACKAGE = 'in.perfectlygood.android';

function withAndroidPackageName(config) {
  // Force package in the config itself
  if (config.android) {
    config.android.package = FORCED_PACKAGE;
  }

  // Also force it in the Android manifest
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (manifest && manifest.$) {
      manifest.$.package = FORCED_PACKAGE;
    }
    return config;
  });
}

module.exports = withAndroidPackageName;
