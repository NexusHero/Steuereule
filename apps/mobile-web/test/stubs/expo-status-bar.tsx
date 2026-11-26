// Test stand-in for expo-status-bar: the real module imports `expo`, whose ESM build (winter runtime,
// async-require setup) needs the Metro globals and extensionless `require`s that Node cannot load under
// Vitest. On the web the status bar is a no-op anyway, so the stub renders nothing.
export function StatusBar(_props: { readonly style?: 'auto' | 'inverted' | 'light' | 'dark' }) {
  return null
}
