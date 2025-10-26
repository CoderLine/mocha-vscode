import { exec, execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const dirname = fileURLToPath(new URL('.', import.meta.url));
const workspaceBaseDir = path.join(dirname, '../test-workspaces');
for(const dir of await fs.promises.readdir(workspaceBaseDir)) {
    const full = path.join(workspaceBaseDir, dir);
    console.info(`npm install for ${full}`);
    execSync(`npm install -D mocha`, {stdio: 'inherit', cwd: full});
}