// Web: installs Metro's async-chunk loader. Without it a dynamic `import()` is compiled to a plain
// require of a module that sits in a separate chunk file nobody loads ("Requiring unknown module"),
// which broke the lazy pdf.js chunks, i.e. reading a PDF text layer in the browser (#450 5D).
import '@expo/metro-runtime'
import { registerRootComponent } from 'expo'
import App from './App'
import { installAppFonts } from './src/lib/fonts'

// Graphit: Geist and Geist Mono come from the bundle; the faces must exist before the first paint.
installAppFonts()

// Entry point for both native (Expo) and web (RN-Web via Metro).
registerRootComponent(App)
