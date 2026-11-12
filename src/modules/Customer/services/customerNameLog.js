/**
 * Customer name change log helpers.
 * customer.log is written by trg_customer_name_log (migrations/add_customer_name_log.sql),
 * one line per name change: "[<UTC time>] <actor> changed Name from <old> to <new>".
 */

/**
 * Turn the stored log text into display lines, newest first.
 * Never throws: a missing or odd value gives an empty list.
 * @param {*} logText - customer.log value
 * @returns {string[]}
 */
function splitNameLog(logText) {
  if (typeof logText !== 'string' || logText.trim() === '') return [];
  return logText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();
}

module.exports = { splitNameLog };
