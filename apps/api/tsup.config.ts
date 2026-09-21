import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/worker.ts', 'src/db/migrate-cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  sourcemap: true,
  // The shared package ships TypeScript source, so bundle it in;
  // everything from npm stays external and is installed in the image.
  noExternal: ['@pricetracker/shared'],
});
