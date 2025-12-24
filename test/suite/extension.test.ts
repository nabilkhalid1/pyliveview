//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

import * as assert from "assert";

import * as vscode from "vscode";
import { PyLiveViewAPI } from "../../src/api";

suite("Extension Tests", () => {
    test("Should provide extension @pyliveview", async () => {
        const started = vscode.extensions.getExtension("nabilab.pyliveview");

        assert.notStrictEqual(started, undefined, 'Extension not started');
    });

    test("Should activate extension @pyliveview", async () => {

        const started = vscode.extensions.getExtension("nabilab.pyliveview");

        const api: PyLiveViewAPI = await started?.activate()
        assert.notStrictEqual(api, undefined, 'No API');

        assert.strictEqual(started?.isActive, true, 'Extension not active');
    });

    test("Should use Python 3", async () => {

        const started = vscode.extensions.getExtension("nabilab.pyliveview");

        const api: PyLiveViewAPI = await started?.activate()

        const pyVersion = await api.getPythonMajorVersion()

        assert.strictEqual(pyVersion, '3', 'Must be running Python major version 3')
    });
});
