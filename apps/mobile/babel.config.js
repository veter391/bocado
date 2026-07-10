module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Worklets plugin MUST be last. Reanimated 4 moved the Babel plugin out of
    // react-native-reanimated into react-native-worklets.
    plugins: ['react-native-worklets/plugin'],
  };
};
