const { defineConfig } = require("@vue/cli-service");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = defineConfig({
  transpileDependencies: true,
  lintOnSave: false,
  outputDir: "dist",
  publicPath: "./",
  pages: {
    popup: {
      entry: "src/popup.js",
      template: "public/popup.html",
      filename: "popup.html",
      chunks: ["chunk-vendors", "chunk-common", "popup"],
    },
  },
  configureWebpack: {
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
