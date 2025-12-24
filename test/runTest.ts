import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';

import { runTests } from '@vscode/test-electron';

function substDrive(driveLetter: string, targetPath: string): void {
  // `subst` needs a trailing colon like "P:".
  execFileSync('cmd.exe', ['/d', '/s', '/c', 'subst', driveLetter, targetPath], {
    stdio: 'pipe',
  });
}

function unsubstDrive(driveLetter: string): void {
  try {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'subst', driveLetter, '/d'], {
      stdio: 'pipe',
    });
  } catch {
    // ignore
  }
}

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const realExtensionDevelopmentPath = path.resolve(__dirname, '../..');

    const tempRoot = process.env.TEMP ?? 'C:\\Temp';
    const testDataRoot = path.join(tempRoot, 'pyliveview-vscode-test');
    const userDataDir = path.join(testDataRoot, 'user-data');
    const extensionsDir = path.join(testDataRoot, 'extensions');
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(extensionsDir, { recursive: true });

    const launchArgs = [
      '--disable-extensions',
      '--user-data-dir',
      userDataDir,
      '--extensions-dir',
      extensionsDir,
    ];

    const runOnce = async (extensionDevelopmentPath: string) => {
      const extensionTestsPath = path.resolve(extensionDevelopmentPath, 'out', 'test', 'suite', 'index');
      await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs,
      });
    };

    try {
      // Prefer running without any path tricks.
      await runOnce(realExtensionDevelopmentPath);
    } catch (err) {
      // Fallback: @vscode/test-electron (and the VS Code launcher it uses) can be sensitive to spaces
      // in `--extensionDevelopmentPath` on Windows, depending on the exact Node/VSC/test-electron versions.
      const isWindows = process.platform === 'win32';
      const hasSpaces = /\s/.test(realExtensionDevelopmentPath);
      if (!isWindows || !hasSpaces) {
        throw err;
      }

      const driveLetter = 'P:';
      unsubstDrive(driveLetter);
      substDrive(driveLetter, realExtensionDevelopmentPath);
      try {
        await runOnce(`${driveLetter}\\`);
      } finally {
        unsubstDrive(driveLetter);
      }
    }
  } catch (err) {
    console.error(err);
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
