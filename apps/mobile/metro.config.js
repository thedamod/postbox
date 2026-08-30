const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, "../..");

// expo-sqlite ships a WebAssembly build for web; Metro must serve .wasm as an asset.
config.resolver.assetExts.push("wasm");

config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot])];
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(workspaceRoot, "node_modules"),
    path.resolve(__dirname, "node_modules"),
  ],
};

module.exports = config;