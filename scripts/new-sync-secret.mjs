import { randomBytes } from 'node:crypto';
// Pipe directly to Wrangler secret put. Do not paste the output into source files.
process.stdout.write(randomBytes(32).toString('base64url'));
