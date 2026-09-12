import { defineConfig } from 'tsup';

/**
 * `@fitbuilder/core` ships raw TypeScript (main: ./src/index.ts) with
 * extensionless imports, so `tsc` alone cannot emit a runnable dist. tsup
 * (esbuild) bundles our source together with whatever it pulls from core and
 * leaves every real npm dependency external.
 */
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: ['@fitbuilder/core'],
  external: ['@huggingface/transformers', 'sharp', 'onnxruntime-node'],
});
