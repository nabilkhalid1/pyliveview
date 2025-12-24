import * as path from 'path';

const Module = require('module');
const extensionRoot = path.resolve(__dirname, '../../..');
const extensionNodeModules = path.join(extensionRoot, 'node_modules');

process.env.NODE_PATH = process.env.NODE_PATH
	? `${extensionNodeModules}${path.delimiter}${process.env.NODE_PATH}`
	: extensionNodeModules;

Module.Module._initPaths();

const Mocha = require('mocha');
const glob: any = require('glob');

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true,
	});

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((c, e) => {
		glob('**/**.test.js', { cwd: testsRoot }, (err: Error | null, files: string[]) => {
			if (err) {
				return e(err);
			}

			// Add files to the test suite
			files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

			try {
				// Run the mocha test
				mocha.run((failures: number) => {
					if (failures > 0) {
						e(new Error(`${failures} tests failed.`));
					} else {
						c();
					}
				});
			} catch (err) {
				console.error(err);
				e(err);
			}
		});
	});
}
