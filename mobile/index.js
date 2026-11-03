import { registerRootComponent } from 'expo'

import App from './App'

// registerRootComponent calls AppRegistry.registerComponent('main', () => App).
// Using an explicit, co-located entry avoids expo/AppEntry's '../../App' import,
// which breaks when expo is hoisted to the monorepo root during EAS builds.
registerRootComponent(App)
