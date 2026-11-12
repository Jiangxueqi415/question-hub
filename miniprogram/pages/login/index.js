const config = require('../../config/index');
const api = require('../../services/api');
const auth = require('../../utils/auth');
const validation = require('../../utils/validation');

Page({
  data: {
    step: 'welcome',
    checking: true,
    loading: false,
    mockMode: config.useMock,
    studentNo: '',
    nickname: '校园用户',
    error: ''
  },

  onLoad() {
    this.restoreSession();
  },

  onBack() {
    // 绑定学号是登录页内的第二步：返回到图片中的登录欢迎页
    if (this.data.step === 'bind') {
      if (this.data.loading) return;
      this.setData({ step: 'welcome', error: '' });
      return;
    }

    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }

    // 登录页常作为入口页，没有上一页；已登录则回首页，否则提示
    const cachedUser = auth.getCachedUser();
    if (auth.getToken() && cachedUser && cachedUser.bound) {
      wx.switchTab({ url: '/pages/home/index' });
      return;
    }

    wx.showToast({ title: '已经是第一页', icon: 'none' });
  },

  /**
   * 本地已有 token 时尝试恢复会话：
   * - 已绑定：直接进首页
   * - 未绑定：停在绑定学号
   * - token 失效：清掉并回到登录
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
        if (me.bound) {
          wx.switchTab({ url: '/pages/home/index' });
          return;
        }
        this.setData({
          checking: false,
          step: 'bind',
          nickname: me.nickname || '校园用户'
        });
      })
      .catch((err) => {
        // 只有鉴权失败才清会话；纯网络异常保留 token，允许用户重试
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
      // Mock 模式不依赖 AppID/secret，直接用假 code 走通流程
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

        if (res.needBind) {
          this.setData({
            step: 'bind',
            nickname: res.user.nickname || '校园用户'
          });
          return;
        }
        wx.switchTab({ url: '/pages/home/index' });
      })
      .catch((err) => {
        this.setData({ loading: false, error: err.message || '登录失败，请重试' });
      });
  },

  onStudentNoInput(e) {
    this.setData({ studentNo: e.detail.value || '', error: '' });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value || '', error: '' });
  },

  onBind() {
    if (this.data.loading) return;

    const checked = validation.validateBind({
      studentNo: this.data.studentNo,
      nickname: this.data.nickname
    });
    if (!checked.ok) {
      this.setData({ error: checked.message });
      return;
    }

    this.setData({ loading: true, error: '' });
    api.bind(checked.value)
      .then((res) => {
        const app = getApp();
        app.setSession(res.token, res.user);
        this.setData({ loading: false });
        wx.showToast({ title: '绑定成功', icon: 'success' });
        setTimeout(function () {
          wx.switchTab({ url: '/pages/home/index' });
        }, 400);
      })
      .catch((err) => {
        this.setData({ loading: false, error: err.message || '绑定失败，请重试' });
      });
  }
});
