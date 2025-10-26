import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = fileURLToPath(new URL('.', import.meta.url));
const workspaceBaseDir = path.join(dirname, '../test-workspaces');
for (const dir of await fs.promises.readdir(workspaceBaseDir)) {
  const full = path.join(workspaceBaseDir, dir);
  if (
    await fs.promises
      .access(path.join(full, 'yarn.lock'))
      .then(() => true)
      .catch(() => false)
  ) {
    console.info(`yarn for ${full}`);
    execSync(`yarn`, { stdio: 'inherit', cwd: full });
    execSync(`yarn add -D mocha`, { stdio: 'inherit', cwd: full });
  } else {
    console.info(`npm install for ${full}`);
    execSync(`npm install -D mocha`, { stdio: 'inherit', cwd: full });
  }
}
