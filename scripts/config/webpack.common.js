const { resolve } = require('path')
const { isDev, PROJECT_PATH } = require('../constant')

const path = require('path')

const HtmlWebpackPlugin = require('html-webpack-plugin')

const CopyPlugin = require('copy-webpack-plugin')

const WebpackBar = require('webpackbar')

const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')

// const WorkerPlugin = require('worker-plugin')

const getCssLoaders = (importLoaders) => [
  'style-loader',
  {
    loader: 'css-loader',
    options: {
      modules: false,
      sourceMap: isDev,
      importLoaders,
    },
  },
  {
    loader: 'postcss-loader',
    options: {
      // ident: 'postcss',
      postcssOptions: {
        plugins: [
          // 修复一些和 flex 布局相关的 bug
          require('postcss-flexbugs-fixes'),
          require('postcss-preset-env')({
            autoprefixer: {
              grid: true,
              flexbox: 'no-2009',
            },
            stage: 3,
          }),
          require('postcss-normalize'),
        ],
      },
      sourceMap: isDev,
    },
  },
]

module.exports = {
  entry: {
    app: resolve(PROJECT_PATH, './src/index'),
    // 'LomoSW': './src/LomoSW.js',
  },
  output: {
    filename: (chunkData) => {
      return chunkData.chunk.name === 'LomoSW' ? 'LomoSW.js' : `js/[name]${isDev ? '' : '.[hash:8]'}.js`
    },
    // filename: `js/[name]${isDev ? '' : '.[hash:8]'}.js`,
    path: resolve(PROJECT_PATH, './dist'),

    globalObject: 'this',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'], // load sorted order

    alias: {
      Src: resolve(PROJECT_PATH, './src'),
      Logic: resolve(PROJECT_PATH, './src/logic'),
      UI: resolve(PROJECT_PATH, './src/ui'),
    },

    fallback: {
      path: require.resolve('path-browserify'),
      fs: false,
    },
  },

  experiments: {
    asyncWebAssembly: true, // or syncWebAssembly: true based on your needs
  },

  module: {
    noParse: /\.wasm$/,
    rules: [
      // for worker.ts like
      {
        test: /\.worker\.ts$/, // to target only specific TypeScript worker files
        use: {
          loader: 'worker-loader',
          options: {
            filename: '[name]:[hash:8].js',
            inline: 'fallback',
          },
        },
      },

      {
        test: /\.wasm$/,
        loader: 'base64-loader',
        type: 'javascript/auto',
        // type: 'webassembly/async', // or 'webassembly/sync' based on your needs
      },

      {
        test: /\.(tsx?|js)$/,
        loader: 'babel-loader',
        options: { cacheDirectory: true },
        exclude: /node_modules/,
      },

      {
        test: /\.css$/,
        use: getCssLoaders(1),
      },

      {
        test: /\.less$/,
        use: [
          ...getCssLoaders(2),
          {
            loader: 'less-loader',
            options: {
              sourceMap: isDev,
            },
          },
        ],
      },

      {
        test: /\.scss$/,
        use: [
          ...getCssLoaders(2),
          {
            loader: 'sass-loader',
            options: {
              sourceMap: isDev,
            },
          },
        ],
      },

      {
        test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
        use: [
          {
            loader: 'url-loader',
            options: {
              limit: 10 * 1024,
              name: '[name].[contenthash:8].[ext]',
              outputPath: 'assets/images',
            },
          },
        ],
      },
      {
        test: /\.(ttf|woff|woff2|eot|otf)$/,
        use: [
          {
            loader: 'url-loader',
            options: {
              name: '[name].[contenthash:8].[ext]',
              outputPath: 'assets/fonts',
            },
          },
        ],
      },

      // babe
    ],
  },

  plugins: [
    // new WorkerPlugin(),

    new HtmlWebpackPlugin({
      template: resolve(PROJECT_PATH, './public/index.html'),
      filename: 'index.html',
      cache: false, // 特别重要：防止之后使用v6版本 copy-webpack-plugin 时代码修改一刷新页面为空问题。
      minify: isDev
        ? false
        : {
            removeAttributeQuotes: true,
            collapseWhitespace: true,
            removeComments: true,
            collapseBooleanAttributes: true,
            collapseInlineTagWhitespace: true,
            removeRedundantAttributes: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true,
            minifyCSS: true,
            minifyJS: true,
            minifyURLs: true,
            useShortDoctype: true,
          },
    }),

    // copy public static assets to /dist
    new CopyPlugin({
      patterns: [
        {
          context: resolve(PROJECT_PATH, './public'),
          from: '*',
          to: resolve(PROJECT_PATH, './dist'),
          toType: 'dir',
          globOptions: {
            dot: true,
            gitignore: true,
            ignore: ['**/index.html'],
          },
        },
      ],
    }),

    new WebpackBar({
      name: isDev ? 'Starting now...' : 'On packagin...',
      color: '#fa8c16',
    }),

    // force type checking, will report error on start or packaging step
    new ForkTsCheckerWebpackPlugin({
      typescript: {
        configFile: resolve(PROJECT_PATH, './tsconfig.json'),
      },
    }),
  ],
}
