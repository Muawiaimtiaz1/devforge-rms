function toDatabaseBoolean(value) {
  return value === "true" || value === true || value === 1 || value === "1" ? 1 : 0;
}

module.exports = { toDatabaseBoolean };
