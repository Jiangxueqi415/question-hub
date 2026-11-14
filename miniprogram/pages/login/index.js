const api = require('../../services/api');
const auth = require('../../utils/auth');
const validation = require('../../utils/validation');

Page({
  data: {
    checking: true,
    loading: false,
    error: '',
    needBind: false,
    bindStudentNo: '',
    bindNickname: '校园用户',
    bindError: '',
    bindLoading: false
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
   * 本地已有 token 时恢复会话。
   * 真实后端要求先绑定学号才发 token，因此未绑定时直接进入绑定表单。
   */
  restoreSession() {
    if (!auth.getToken()) {
      this.setData({ checking: false });
      return;
    }
    api.getMe()
      .then((me) => {
        if (me && me.bound === false) {
          this.setData({
            checking: false,
            needBind: true,
            bindNickname: (me && me.nickname) || '校园用户'
          });
          return;
        }
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

    wx.login({
      success: (res) => {
        if (!res.code) {
          this.setData({ loading: false, error: '微信登录失败，请重试' });
          return;
        }
        this.doLogin(res.code);
      },
      fail: () => {
        this.setData({ loading: false, error: '微信登录失败，请重试' });
      }
    });
  },

  doLogin(code) {
    api.login({ code: code })
      .then((res) => {
        const data = res || {};
        if (data.token && data.user) {
          const app = getApp();
          app.setSession(data.token, data.user);
          this.setData({ loading: false, needBind: false });
          wx.switchTab({ url: '/pages/home/index' });
          return;
        }

        // 后端真实契约：首次登录只返回 openid + needBind，绑定学号后才发 token
        this.setData({
          loading: false,
          needBind: true,
          bindNickname: (data.user && data.user.nickname) || this.data.bindNickname || '校园用户',
          bindError: ''
        });
      })
      .catch((err) => {
        this.setData({ loading: false, error: err.message || '登录失败，请重试' });
      });
  },

  onBindStudentInput(e) {
    this.setData({ bindStudentNo: e.detail.value || '', bindError: '' });
  },

  onBindNicknameInput(e) {
    this.setData({ bindNickname: e.detail.value || '', bindError: '' });
  },

  onBindSubmit() {
    if (this.data.bindLoading) return;

    const checked = validation.validateBind({
      studentNo: this.data.bindStudentNo,
      nickname: this.data.bindNickname
    });
    if (!checked.ok) {
      this.setData({ bindError: checked.message });
      return;
    }

    this.setData({ bindLoading: true, bindError: '' });
    api.bind(checked.value)
      .then((res) => {
        const app = getApp();
        app.setSession(res.token, res.user);
        this.setData({ bindLoading: false, needBind: false });
        wx.showToast({ title: '绑定成功', icon: 'success' });
        wx.switchTab({ url: '/pages/home/index' });
      })
      .catch((err) => {
        this.setData({
          bindLoading: false,
          bindError: (err && err.message) || '绑定失败，请重试'
        });
      });
  }
});
