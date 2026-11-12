const constants = require('./constants');

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '';
  return (
    d.getFullYear() +
    '-' +
    pad2(d.getMonth() + 1) +
    '-' +
    pad2(d.getDate()) +
    ' ' +
    pad2(d.getHours()) +
    ':' +
    pad2(d.getMinutes())
  );
}

function formatShort(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '';
  return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function formatClock(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '';
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

/**
 * 信誉分等级：优秀 85–100 / 良好 70–84 / 一般 40–69 / 较差 0–39
 */
function levelOf(credit) {
  let score = Number(credit);
  if (isNaN(score)) score = constants.INITIAL_CREDIT;
  score = Math.max(constants.CREDIT_MIN, Math.min(constants.CREDIT_MAX, score));
  let level = constants.CREDIT_LEVELS[constants.CREDIT_LEVELS.length - 1];
  for (let i = 0; i < constants.CREDIT_LEVELS.length; i += 1) {
    if (score >= constants.CREDIT_LEVELS[i].min) {
      level = constants.CREDIT_LEVELS[i];
      break;
    }
  }
  return { name: level.name, tone: level.tone, score: score };
}

function durationText(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < 60) return s + ' 秒';
  return Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒';
}

function deltaText(delta) {
  const n = Number(delta) || 0;
  return (n > 0 ? '+' : '') + n;
}

/**
 * picker 的 date/time 字符串转本地时间戳。
 * 不使用 new Date('YYYY-MM-DD HH:mm')，避免 iOS/旧内核解析差异。
 */
function parseLocalDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return 0;
  const dateParts = String(dateStr).split('-');
  const timeParts = String(timeStr).split(':');
  if (dateParts.length !== 3 || timeParts.length < 2) return 0;
  const year = Number(dateParts[0]);
  const month = Number(dateParts[1]);
  const day = Number(dateParts[2]);
  const hour = Number(timeParts[0]);
  const minute = Number(timeParts[1]);
  if (!year || !month || !day) return 0;
  const value = new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0).getTime();
  return isNaN(value) ? 0 : value;
}

function addDays(ts, days) {
  return Number(ts) + Number(days) * 24 * 60 * 60 * 1000;
}

function dateStr(ts) {
  return formatDate(ts);
}

function timeStr(ts) {
  return formatClock(ts);
}

module.exports = {
  formatDateTime: formatDateTime,
  formatShort: formatShort,
  formatDate: formatDate,
  formatClock: formatClock,
  levelOf: levelOf,
  durationText: durationText,
  deltaText: deltaText,
  parseLocalDateTime: parseLocalDateTime,
  addDays: addDays,
  dateStr: dateStr,
  timeStr: timeStr
};
