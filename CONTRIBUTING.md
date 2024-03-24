# Contributing Guide

This project was scaffolded with the Yeoman and VS Code Extension generator. 
https://code.visualstudio.com/api/get-started/your-first-extension


## Get up and running straight away

* Press `F5` to open a new window with the extension loaded.
* Set breakpoints in the code inside `src/extension.ts` to debug the extension.
* Find output from the extension in the debug console.


## Make changes

* You can relaunch the extension from the debug toolbar after changing code in `src/extension.ts`.
* You can also reload (`Ctrl+R` or `Cmd+R` on Mac) the VS Code window with the extension to load your changes.

## Run tests (of this extension)

* Install the [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner)
* Run the "watch" task via the **Tasks: Run Task** command. Make sure this is running, or tests might not be discovered.
* Open the Testing view from the activity bar and click the Run Test" button, or use the hotkey `Ctrl/Cmd + ; A`
* See the output of the test result in the Test Results view.
* Make changes to `src/test/extension.test.ts` or create new test files inside the `test` folder.
  * The provided test runner will only consider files matching the name pattern `**.test.ts`.
  * You can create folders inside the `test` folder to structure your tests any way you want.
