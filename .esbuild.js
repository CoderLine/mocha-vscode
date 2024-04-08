const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');
const minify = watch ? process.argv.includes('--minify') : !process.argv.includes('--no-minify');

const ctx = esbuild.context({
  entryPoints: ['src/extension.ts', 'src/reporter/fullJsonStreamReporter.ts'],
  tsconfig: './tsconfig.json',
  bundle: true,
  external: ['vscode', 'pnpapi', 'mocha', 'esbuild'],
  sourcemap: !minify,
  minify,
  platform: 'node',
  outdir: 'out',
  keepNames: !minify,
  plugins: [
    {
      name: 'mocha-vscode-ts-nocheck',
      async setup(build) {

        const write = build.initialOptions.write;
        build.initialOptions.write = false;

        build.onEnd(async (result) => {
          if(result.outputFiles && write === undefined || write) {
            result.outputFiles.forEach(file => {
              fs.mkdirSync(path.dirname(file.path), { recursive: true });
              const fd = fs.openSync(file.path, 'w');
              try {
                fs.writeSync(fd, '// @ts-nocheck\n');
                fs.writeSync(fd, file.contents);
              }
              finally {
                fs.closeSync(fd);
              }
            });
          }
        });
      },
    },
  ],
});

ctx
  .then((ctx) => (watch ? ctx.watch() : ctx.rebuild()))
  .then(
    () => !watch && process.exit(0),
    () => process.exit(1),
  );
