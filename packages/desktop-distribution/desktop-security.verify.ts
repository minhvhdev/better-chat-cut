import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const main = await readFile(join(root, 'desktop', 'main.ts'), 'utf8');
const preload = await readFile(join(root, 'desktop', 'preload.ts'), 'utf8');

assert.match(main, /contextIsolation:\s*true/);
assert.match(main, /nodeIntegration:\s*false/);
assert.match(main, /webSecurity:\s*true/);
assert.match(main, /allowRunningInsecureContent:\s*false/);
assert.match(main, /setPermissionRequestHandler/);
assert.doesNotMatch(main, /nodeIntegration:\s*true/);
assert.doesNotMatch(main, /enableRemoteModule:\s*true/);
assert.match(preload, /contextBridge\.exposeInMainWorld/);
assert.match(preload, /openChatCutDesktop/);
// Preload allowlist: only directory picker / export destination
assert.doesNotMatch(preload, /child_process/);
assert.doesNotMatch(preload, /process\.env/);
assert.doesNotMatch(preload, /fs\./);

// No unrestricted shell
assert.doesNotMatch(main, /shell\.openExternal\([^)]*req/);
assert.doesNotMatch(main, /ipcMain\.handle\(['"]shell/);

console.log('desktop-security: ok');
