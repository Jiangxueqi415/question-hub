const config = require('../config/index');
const auth = require('./auth');
const constants = require('./constants');

function makeError(code, message) {
  const err = new Error(message || constants.ERROR_MESSAGES[code] || '请求失败');
  err.code = code || 'SERVER_ERROR';
  return err;
}

let redirecting = false;

function handleUnauthorized() {
  auth.clear();
  const app = getApp();
  if (app) app.globalData.user = null;
  if (redirecting) return;
  redirecting = true;
  wx.reLaunch({
    url: '/pages/login/index',
    complete() {
      setTimeout(function () {
        redirecting = false;
      }, 800);
    }
  });
}

/**
 * 统一请求入口：拼接 baseUrl、注入 Bearer token、解包统一响应。
 *
 * 服务端响应约定（PRD 第 9 节）：{ code, message, data }
 * code === 0 视为成功，其余按业务错误处理。
 */
function request(options) {
  const opts = options || {};
  const method = (opts.method || 'GET').toUpperCase();
  const url = opts.url || '';
  const data = opts.data || {};

  return new Promise(function (resolve, reject) {
    const header = { 'content-type': 'application/json' };
    const token = auth.getToken();
    if (token) header.Authorization = 'Bearer ' + token;

    wx.request({
      url: config.baseUrl + url,
      method: method,
      data: data,
      header: header,
      timeout: 15000,
      success(res) {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 'AUTH_REQUIRED') {
          handleUnauthorized();
          reject(makeError('AUTH_REQUIRED', body.message || constants.ERROR_MESSAGES.AUTH_REQUIRED));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && (body.code === 0 || body.code === undefined)) {
          resolve(body.data);
          return;
        }
        reject(makeError(body.code || 'SERVER_ERROR', body.message || '请求失败'));
      },
      fail(err) {
        const message = err && err.errMsg ? '网络异常：' + err.errMsg : constants.ERROR_MESSAGES.NETWORK_ERROR;
        reject(makeError('NETWORK_ERROR', message));
      }
    });
  });
}

module.exports = request;
module.exports.makeError = makeError;
