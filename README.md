# Mocha VS Code Extension

This is the Mocha extension for VS Code enabling developers to run and debug tests right within VS Code using the built-in test explorer.

> [!NOTE]
> This extension is in a fairly early development stage but mostly functional. We soon
> will start to publish some pre-release versions to the VS Code Extension gallery.
> Please provide feedback and discuss improvements over at https://github.com/CoderLine/mocha-vscode/discussions

## Credits

This project started as a fork of the `Extension Test Runner` and `Command-line runner for VS Code tests` developed by Microsoft and then was adapted to work with Mocha directly.
The main credits of this extension go over to the folks at Microsoft (and their contributors) and without them it would have been a lot more effort to ship a Mocha test runner for VS Code.

- https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner
- https://github.com/microsoft/vscode-extension-test-runner
- https://github.com/microsoft/vscode-test-cl

## Getting Started

Please follow the [general Mocha documentation](https://mochajs.org/) to initially set up tests using the command line. Then, [install this extension](https://marketplace.visualstudio.com/items?itemName=mocha.mocha-vscode).

This extension automatically discovers and works with the `.mocharc.js/cjs/yaml/yml/json/jsonc` files found in your workspace. It requires minimal to no extra configuration. It works by looking at test files in your JavaScript code. If you write tests in TypeScript, you will want to:

1. Modify your tsconfig.json and add `"sourceMap": true`

## Configuration

- `mocha-vscode.extractSettings`: configures how tests get extracted. You can configure:

  - The `extractWith` mode, that specifies if tests are extracted via evaluation or syntax-tree parsing. Evaluation is likely to lead to better results, but may have side-effects. Defaults to `evaluation`.
  - The `extractTimeout` limiting how long the extraction of tests for a single file is allowed to take.
  - The `test` and `suite` identifiers the process extracts. Defaults to `["it", "test"]` and `["describe", "suite"]` respectively, covering Mocha's common interfaces.

- `mocha-vscode.debugOptions`: options, normally found in the launch.json, to pass when debugging the extension. See [the docs](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_launch-configuration-attributes) for a complete list of options.
