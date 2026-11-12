const config = require('../../config/index');
const api = require('../../services/api');
const auth = require('../../utils/auth');

Page({
  data: {
    checking: true,
    loading: false,
    mockMode: config.useMock,
    error: ''
  },

  onLoad() {
    this.restoreSession();
  },

  onBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }

    const cachedUser = auth.getCachedUser();
    if (auth.getToken() && cachedUser && cachedUser.bound) {
      wx.switchTab({ url: '/pages/home/index' });
      return;
    }

    wx.showToast({ title: '已经是第一页', icon: 'none' });
  },

  /**
   * 本地已有 token 时恢复会话。未绑定也先进入首页浏览，绑定入口在“我的”。
   */
  restoreSession() {
    if (!auth.getToken()) {
      this.setData({ checking: false });
      return;
    }
    api.getMe()
      .then((me) => {
        const app = getApp();
        app.updateUser(me);
        wx.switchTab({ url: '/pages/home/index' });
      })
      .catch((err) => {
        if (err && err.code === 'AUTH_REQUIRED') {
          const app = getApp();
          app.clearSession();
        }
        this.setData({
          checking: false,
          error: err && err.code === 'NETWORK_ERROR' ? '网络异常，请重新登录' : ''
        });
      });
  },

  onLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });

    if (config.useMock) {
      this.doLogin('mock-code');
      return;
    }

    wx.login({
      success: (res) => {
        this.doLogin(res.code);
      },
      fail: () => {
        this.setData({ loading: false, error: '微信登录失败，请重试' });
      }
    });
  },

  doLogin(code) {
    api.login({ code: code || 'mock-code' })
      .then((res) => {
        const app = getApp();
        app.setSession(res.token, res.user);
        this.setData({ loading: false });
        // 未绑定学号也可以先浏览；绑定入口放在“我的”
        wx.switchTab({ url: '/pages/home/index' });
      })
      .catch((err) => {
        this.setData({ loading: false, error: err.message || '登录失败，请重试' });
      });
  }
});
