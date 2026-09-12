// Metro config for the FitBuilder npm-workspaces monorepo.
// - Watches the workspace root so `@fitbuilder/core` (shipped as TS source) is bundled and hot-reloads.
// - Resolves node_modules from the app first, then the workspace root.
// - Pins React / React Native to the app's copy so core (which lives outside apps/mobile and would
//   otherwise walk up to the root's React 18) never yields a second React instance.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

const SINGLETONS = ['react', 'react-dom', 'react-native', 'react-native-web', 'scheduler'];
const isSingleton = (name) => SINGLETONS.some((s) => name === s || name.startsWith(`${s}/`));

const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const ctx =
    isSingleton(moduleName) && !context.originModulePath.startsWith(projectRoot)
      ? { ...context, originModulePath: path.join(projectRoot, 'package.json') }
      : context;
  return upstreamResolve ? upstreamResolve(ctx, moduleName, platform) : ctx.resolveRequest(ctx, moduleName, platform);
};

module.exports = config;
