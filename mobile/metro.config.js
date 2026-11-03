// Monorepo-aware Metro config.
// WomenFlare uses npm workspaces, so dependencies (including expo) are hoisted
// to the repo root node_modules. Metro must watch the repo root and resolve
// modules from both the project and the root node_modules.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

// 1. Watch all files within the monorepo.
config.watchFolders = [workspaceRoot]

// 2. Resolve modules from the project first, then the hoisted root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

module.exports = config
