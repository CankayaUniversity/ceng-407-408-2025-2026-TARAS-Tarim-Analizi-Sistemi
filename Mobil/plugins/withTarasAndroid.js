// TARAS Android build-gradle patches — umbrella plugin
//
// Expo's mod ordering for withAppBuildGradle is LIFO: plugins added LAST run FIRST.
// Composition order below reflects that: the plugin we want to run LAST (withGradleSyntax
// — runs over everyone else's output to add `=` where needed) is composed LAST, making
// it land on top of the stack and pop LAST at applyModifiers time.
//
// If you reorder, know that each sub-plugin's withAppBuildGradle mod sees the accumulated
// contents from every mod above it in the stack. Downstream regexes may need to handle
// both `prop value` and `prop = value` forms (see withAppLint/withGradleSize).

const withGradleSyntax = require("./withGradleSyntax");
const withAppLint = require("./withAppLint");
const withGradleSize = require("./withGradleSize");
const withAbiSplits = require("./withAbiSplits");
const withProguard = require("./withProguard");
const withHermesV1 = require("./withHermesV1");

module.exports = (config, opts = {}) => {
  config = withGradleSyntax(config);
  config = withAppLint(config);
  config = withGradleSize(config);
  config = withAbiSplits(config);
  config = withProguard(config);
  // REMOVE-ON-SDK56 — useHermesV1 gate
  config = withHermesV1(config, { useHermesV1: !!opts.useHermesV1 });
  return config;
};
