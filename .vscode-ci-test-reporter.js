const BaseReporter = require('mocha/lib/reporters/base');
const SpecReporter = require('mocha/lib/reporters/spec');
const JsonReporter = require('mocha/lib/reporters/json');
const Mocha = require('mocha');

module.exports = class MultiReporter extends BaseReporter {
  reporters;

  constructor(runner, options) {
    super(runner, options);
    this.reporters = [
      new SpecReporter(runner, {
        reporterOption: options.reporterOption.specReporterOption,
      }),
      new JsonReporter(runner, {
        reporterOption: options.reporterOption.jsonReporterOption,
      }),
      new (class TestExecutionLogReporter {
        constructor(runner) {
          let indent = 0;
          function log(txt) {
            console.log(' '.repeat(indent * 2) + txt)
          }

          runner.on(Mocha.Runner.constants.EVENT_RUN_BEGIN, () => {
            log('Begin Run')
            indent++;
          });
          runner.on(Mocha.Runner.constants.EVENT_RUN_END, () => {
            indent--;
            log('End Run')
          });
          runner.on(Mocha.Runner.constants.EVENT_SUITE_BEGIN, (suite) => {
            log(`Begin Suite '${suite.titlePath()}'`)
            indent++;
          });
          runner.on(Mocha.Runner.constants.EVENT_SUITE_END, (suite) => {
            indent--;
            log(`End Suite '${suite.titlePath()}'`)
          });
          runner.on(Mocha.Runner.constants.EVENT_TEST_BEGIN, (test) => {
            log(`Begin Test '${test.title}'`)
            indent++;
          });
          runner.on(Mocha.Runner.constants.EVENT_TEST_END, (test) => {
            indent--;
            log(`End Test '${test.title}'`)
          });
        }
      })(runner),
    ];
  }
};
