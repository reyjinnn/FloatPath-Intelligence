// Run: node tests/presentation.check.cjs
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

const source = readFileSync(join(__dirname, "../src/lib.ts"), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const context = { exports: {} };
runInNewContext(outputText, context);
const { integer, decimalText, percent, numericLabel, assessmentLabel, roleLabel, evidenceLabel, holderLabel, companyLabel } = context.exports;

assert.equal(integer(1234567), "1,234,567");
assert.equal(integer(12345678901234567890n), "12,345,678,901,234,567,890");
assert.equal(integer(null), "Unknown");
assert.equal(integer(Number.MAX_SAFE_INTEGER + 1), "Unsafe number");
assert.equal(decimalText("12345678901234567890.1200"), "12,345,678,901,234,567,890.12");
assert.equal(decimalText("-0.123456789"), "≈ −0.123456");
assert.equal(decimalText(null), "Unknown");
assert.equal(percent("0.15"), "15.00%");
assert.equal(percent("0.123456789"), "≈ 12.345678%");
assert.equal(percent(null), "Unknown");
assert.equal(numericLabel("PASS_NUMERIC"), "Numeric target met");
assert.equal(numericLabel("BELOW_TARGET"), "Below numeric target");
assert.equal(numericLabel("UNKNOWN"), "Unknown");
assert.equal(assessmentLabel("REQUIRES_VERIFICATION"), "Verification required");
assert.equal(roleLabel("analyst"), "Analyst");
assert.equal(roleLabel("viewer"), "Viewer");
assert.equal(evidenceLabel(null), "No evidence reference");
assert.equal(evidenceLabel("fixture://synthetic/ledger.csv"), "Synthetic source · ledger.csv");
assert.equal(holderLabel("DEMO-PENGENDALI"), "DEMO-PENGENDALI");
assert.equal(companyLabel({ code: "SYNTH" }), "SYNTH");
console.log("English presentation checks passed.");
