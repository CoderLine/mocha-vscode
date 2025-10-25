/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { exec } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import type * as vscode from 'vscode';

// this logic is aligned with the ESBuild install script, unfortunately we cannot use pkgAndSubpathForCurrentPlatform directly
// so we have a copy of the logic, we should reach out to ESBUild to export the API from install.js

type PlatformLookup = { [platform: string]: string };

const knownWindowsPackages: PlatformLookup = {
  'win32 arm64 LE': '@esbuild/win32-arm64',
  'win32 ia32 LE': '@esbuild/win32-ia32',
  'win32 x64 LE': '@esbuild/win32-x64'
};
const knownUnixlikePackages: PlatformLookup = {
  'aix ppc64 BE': '@esbuild/aix-ppc64',
  'android arm64 LE': '@esbuild/android-arm64',
  'darwin arm64 LE': '@esbuild/darwin-arm64',
  'darwin x64 LE': '@esbuild/darwin-x64',
  'freebsd arm64 LE': '@esbuild/freebsd-arm64',
  'freebsd x64 LE': '@esbuild/freebsd-x64',
  'linux arm LE': '@esbuild/linux-arm',
  'linux arm64 LE': '@esbuild/linux-arm64',
  'linux ia32 LE': '@esbuild/linux-ia32',
  'linux mips64el LE': '@esbuild/linux-mips64el',
  'linux ppc64 LE': '@esbuild/linux-ppc64',
  'linux riscv64 LE': '@esbuild/linux-riscv64',
  'linux s390x BE': '@esbuild/linux-s390x',
  'linux x64 LE': '@esbuild/linux-x64',
  'linux loong64 LE': '@esbuild/linux-loong64',
  'netbsd x64 LE': '@esbuild/netbsd-x64',
  'openbsd arm64 LE': '@esbuild/openbsd-arm64',
  'openbsd x64 LE': '@esbuild/openbsd-x64',
  'sunos x64 LE': '@esbuild/sunos-x64'
};
const knownWebAssemblyFallbackPackages: PlatformLookup = {
  'android arm LE': '@esbuild/android-arm',
  'android x64 LE': '@esbuild/android-x64'
};
function getPlatformPackageName() {
  let pkg: string;
  const platformKey = `${process.platform} ${os.arch()} ${os.endianness()}`;
  if (platformKey in knownWindowsPackages) {
    pkg = knownWindowsPackages[platformKey];
  } else if (platformKey in knownUnixlikePackages) {
    pkg = knownUnixlikePackages[platformKey];
  } else if (platformKey in knownWebAssemblyFallbackPackages) {
    pkg = knownWebAssemblyFallbackPackages[platformKey];
  } else {
    throw new Error(`Unsupported platform: ${platformKey}`);
  }
  return pkg;
}

export async function esbuildPackageVersion() {
  let pkg: string;
  const platformKey = `${process.platform} ${os.arch()} ${os.endianness()}`;
  if (platformKey in knownWindowsPackages) {
    pkg = knownWindowsPackages[platformKey];
  } else if (platformKey in knownUnixlikePackages) {
    pkg = knownUnixlikePackages[platformKey];
  } else if (platformKey in knownWebAssemblyFallbackPackages) {
    pkg = knownWebAssemblyFallbackPackages[platformKey];
  } else {
    throw new Error(`Unsupported platform: ${platformKey}`);
  }
  return pkg;
}

// ESBuild needs the platform specific binary for execution
// here we run the init script coming with ESBuild
export async function initESBuild(context: vscode.ExtensionContext, logChannel: vscode.LogOutputChannel) {
  logChannel.debug('Checking ESBuild availability');

  const platformPackageName = getPlatformPackageName();
  let platformPackageAndVersion: string;
  try {
    logChannel.debug('Determining ESBuild platform package and version');

    const packageJson = JSON.parse(
      await fs.promises.readFile(path.join(context.extensionPath, 'node_modules', 'esbuild', 'package.json'), 'utf-8')
    );

    let packageVersion = packageJson.optionalDependencies?.[platformPackageName];
    if (!packageVersion) {
      packageVersion = packageJson.version;
    }
    platformPackageAndVersion = `${platformPackageName}@${packageVersion}`;
    logChannel.debug(`Determined ESBuild platform package ${platformPackageAndVersion}`);

    // check if already installed
    const platformPackageJsonPath = path.join(
      context.extensionPath,
      'node_modules',
      ...platformPackageName.split('/'),
      'package.json'
    );
    if (fs.existsSync(platformPackageJsonPath)) {
      try {
        const platformPackageJson = JSON.parse(await fs.promises.readFile(platformPackageJsonPath, 'utf-8'));
        if (platformPackageJson.version === packageVersion) {
          logChannel.debug(
            `Determining ESBuild platform package ${platformPackageAndVersion} already installed, skipping install`
          );
          return;
        }
      } catch {
        // ignore and trigger install
      }
    }
  } catch (e) {
    logChannel.error('Failed to determine ESBuild platform package', (e as Error).message, (e as Error).stack);
    return;
  }

  const temp = path.join(context.extensionPath, 'tmp');
  await fs.promises.rm(temp, { recursive: true, force: true });
  await fs.promises.mkdir(temp);

  const cmd = ['npm', 'pack', platformPackageAndVersion];
  logChannel.debug(`Downloading npm package via ${cmd.join(' ')}`);
  await new Promise<void>((resolve, reject) => {
    exec(
      cmd.join(' '),
      {
        cwd: temp,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1'
        },
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (stdout) {
          logChannel.debug('[ESBuild-stdout]', stdout);
        }
        if (stderr) {
          logChannel.debug('[ESBuild-stderr]', stderr);
        }

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }
    );
  });

  const tgzPath = (
    await fs.promises.readdir(temp, {
      withFileTypes: true,
      recursive: false
    })
  )[0];
  logChannel.debug(`Extracting ${tgzPath.name}`);
  await tar.extract({
    file: path.join(temp, tgzPath.name),
    cwd: temp
  });

  const targetPath = path.join(context.extensionPath, 'node_modules', platformPackageName);
  try {
    if (fs.existsSync(targetPath)) {
      logChannel.debug(`Deleting existing files at ${targetPath}`);
      await fs.promises.rm(targetPath, { recursive: true, force: true });
    }
  } catch (e) {
    logChannel.debug(`Error deleting files at ${targetPath}`, e);
  }

  logChannel.debug(`Moving files to ${targetPath}`);
  try {
    await fs.promises.mkdir(path.dirname(targetPath));
    await fs.promises.rename(path.join(temp, 'package'), targetPath);
  } catch (e) {
    logChannel.debug(`Error moving files to ${targetPath}`, e);
  }
}
