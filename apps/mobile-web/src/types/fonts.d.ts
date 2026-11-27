// A font file imported as a module: Metro hands back an asset id, Vite (tests) a URL.
declare module '*.ttf' {
  const asset: number | string
  export default asset
}
