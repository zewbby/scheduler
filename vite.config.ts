import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
const accountPath = new URL('./.local/account.json', import.meta.url);
const account = existsSync(accountPath) ? JSON.parse(readFileSync(accountPath, 'utf8')) : null;
const deploymentPath = new URL('./cloudflare/deployment.json', import.meta.url);
const deployment = existsSync(deploymentPath) ? JSON.parse(readFileSync(deploymentPath, 'utf8')) : {endpoint:''};
export default defineConfig({ plugins: [react()], base: './', define: { __LIUBAI_ACCOUNT_NAME__: JSON.stringify(account?.username||''), __LIUBAI_SYNC_DEFAULT__: JSON.stringify(deployment.endpoint) }, server: { port: 5173, strictPort: true, watch: { ignored: ['**/release/**','**/.artifacts/**','**/.wrangler/**','**/.tools/**'] } } });
