// Development entry: API server and background worker in one process, so
// `npm run dev` is all you need. In production they run as separate processes.
import { startServer } from './server';
import { startWorker } from './worker';

await startServer();
await startWorker();
