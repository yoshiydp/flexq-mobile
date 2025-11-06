module.exports = function (api) {
  const isTest = api.env('test');
  api.cache.using(() => (isTest ? 'test' : 'default'));

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: { '@': './src' },
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      ],
      !isTest && 'react-native-worklets/plugin',
    ].filter(Boolean),
  };
};
