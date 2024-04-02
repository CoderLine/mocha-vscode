const BaseReporter = require('mocha/lib/reporters/base');
const SpecReporter = require('mocha/lib/reporters/spec');
const JsonReporter = require('mocha/lib/reporters/json');

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
    ];
  }
};
