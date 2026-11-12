const request = require('../utils/request');

/**
 * 接口封装，与 PRD 第 9 节的最小接口契约一一对应。
 *
 * 说明：新人任务与昵称修改在 PRD 的接口表中未列出，
 * 这里按同一风格补了 POST /me/onboard 与 PATCH /me，联调时需与后端确认。
 */
const api = {
  // ---------- 身份 ----------
  login(data) {
    return request({ url: '/auth/login', method: 'POST', data: data || {} });
  },

  bind(data) {
    return request({ url: '/auth/bind', method: 'POST', data: data || {} });
  },

  // ---------- 用户 ----------
  getMe() {
    return request({ url: '/me' });
  },

  updateNickname(nickname) {
    return request({ url: '/me', method: 'PATCH', data: { nickname: nickname } });
  },

  onboard() {
    return request({ url: '/me/onboard', method: 'POST' });
  },

  getLedger(type) {
    return request({ url: '/me/ledger?type=' + (type === 'credit' ? 'credit' : 'points') });
  },

  getMySurveys() {
    return request({ url: '/me/surveys' });
  },

  getMyResponses() {
    return request({ url: '/me/responses' });
  },

  // ---------- 问卷 ----------
  getSurveys() {
    return request({ url: '/surveys?status=open' });
  },

  getSurvey(id) {
    return request({ url: '/surveys/' + encodeURIComponent(id) });
  },

  createSurvey(payload) {
    return request({ url: '/surveys', method: 'POST', data: payload });
  },

  startSurvey(id) {
    return request({ url: '/surveys/' + encodeURIComponent(id) + '/start', method: 'POST' });
  },

  submitSurvey(id, payload) {
    return request({
      url: '/surveys/' + encodeURIComponent(id) + '/submit',
      method: 'POST',
      data: payload
    });
  }
};

module.exports = api;
