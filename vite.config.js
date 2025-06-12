const { defineConfig } = require("@vue/cli-service");
const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = defineConfig({
  transpileDependencies: true,
  lintOnSave: false,
  pages: {
    index: {
      entry: "src/main.js",
      template: "public/index.html",
      filename: "index.html",
      title: "抖音视频下载器",
    },
  },
  configureWebpack: {
    output: {
      filename: "[name].js",
      chunkFilename: "[name].js",
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          {
            from: "manifest.json",
            to: "manifest.json",
          },
          {
            from: "content.js",
            to: "content.js",
          },
          {
            from: "background.js",
            to: "background.js",
          },
          {
            from: "images",
            to: "images",
          },
        ],
      }),
    ],
  },
});
