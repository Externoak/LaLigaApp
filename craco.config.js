module.exports = {
  webpack: {
    configure: (webpackConfig, { env }) => {
      if (env === 'production') {
        webpackConfig.optimization = {
          ...webpackConfig.optimization,
          splitChunks: {
            chunks: 'all',
            cacheGroups: {
              default: { minChunks: 2, priority: -20, reuseExistingChunk: true },
              vendor: { test: /[\\/]node_modules[\\/]/, name: 'vendors', priority: -10, chunks: 'all' },
              react: { test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/, name: 'react', priority: 20, chunks: 'all' },
              reactQuery: { test: /[\\/]node_modules[\\/]@tanstack[\\/]/, name: 'react-query', priority: 15, chunks: 'all' },
              utils: { test: /[\\/]src[\\/]utils[\\/]/, name: 'utils', priority: 10, chunks: 'all', minSize: 0 },
            },
          },
        };
      }
      return webpackConfig;
    },
  },
};

