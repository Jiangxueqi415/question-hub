const TOKEN_KEY = 'qh_token';
const USER_KEY = 'qh_user';
const OPENID_KEY = 'qh_openid';

function getToken() {
  try {
    return wx.getStorageSync(TOKEN_KEY) || '';
  } catch (err) {
    return '';
  }
}

function saveToken(token) {
  try {
    wx.setStorageSync(TOKEN_KEY, token || '');
  } catch (err) {
    // 存储失败时不阻断流程，接口仍会以服务端校验为准
  }
}

function getOpenid() {
  try {
    return wx.getStorageSync(OPENID_KEY) || '';
  } catch (err) {
    return '';
  }
}

function saveOpenid(openid) {
  try {
    wx.setStorageSync(OPENID_KEY, openid || '');
  } catch (err) {
    // 忽略：下次登录会重新获取
  }
}

function getCachedUser() {
  try {
    const raw = wx.getStorageSync(USER_KEY);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    return null;
  }
}

function saveUser(user) {
  try {
    wx.setStorageSync(USER_KEY, user || null);
  } catch (err) {
    // 忽略：用户快照只用于首屏占位
  }
}

function clear() {
  try {
    wx.removeStorageSync(TOKEN_KEY);
    wx.removeStorageSync(USER_KEY);
    wx.removeStorageSync(OPENID_KEY);
  } catch (err) {
    // 忽略
  }
}

module.exports = {
  getToken: getToken,
  saveToken: saveToken,
  getOpenid: getOpenid,
  saveOpenid: saveOpenid,
  getCachedUser: getCachedUser,
  saveUser: saveUser,
  clear: clear
};
