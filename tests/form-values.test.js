const test = require("node:test");
const assert = require("node:assert/strict");
const { toDatabaseBoolean } = require("../utils/form-values");

test("form boolean accepts enabled values sent by JSON and multipart forms", () => {
  assert.equal(toDatabaseBoolean(true), 1);
  assert.equal(toDatabaseBoolean(1), 1);
  assert.equal(toDatabaseBoolean("true"), 1);
  assert.equal(toDatabaseBoolean("1"), 1);
});

test("form boolean stores other values as disabled", () => {
  assert.equal(toDatabaseBoolean(false), 0);
  assert.equal(toDatabaseBoolean(0), 0);
  assert.equal(toDatabaseBoolean("false"), 0);
  assert.equal(toDatabaseBoolean("0"), 0);
  assert.equal(toDatabaseBoolean(undefined), 0);
});
