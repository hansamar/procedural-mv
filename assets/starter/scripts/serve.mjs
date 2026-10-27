// Dev server: node scripts/serve.mjs  (PORT env, default 5173) -> open http://localhost:5173
import { startServer } from './static-server.mjs';

const port = Number(process.env.PORT || 5173);
await startServer(port, 'localhost');
console.log(`http://localhost:${port}`);
