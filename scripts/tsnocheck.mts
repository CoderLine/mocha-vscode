import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const dirname = fileURLToPath(new URL('.', import.meta.url));
const reporter = path.join(dirname, '../out/reporter');
const files = (await fs.promises.readdir(reporter)).map(f => `${reporter}/${f}`);
for(const f of files) {
    await fs.promises.writeFile(
        f,
        '// @ts-nocheck\n' + 
        (await fs.promises.readFile(f, 'utf-8'))
    )
}