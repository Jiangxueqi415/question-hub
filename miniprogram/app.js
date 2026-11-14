const config = require('./config/index');
const auth = require('./utils/auth');

App({
  globalData: {
    config: config,
    user: null
  },

  onLaunch() {
    this.globalData.user = auth.getCachedUser();
  },

  /**
   * 登录/绑定成功后保存会话。
   * token 与用户快照都存本地，仅用于启动时快速判断；权限始终以服务端为准。
   */
  setSession(token, user) {
    auth.saveToken(token);
    auth.saveUser(user);
    this.globalData.user = user;
  },

  updateUser(user) {
    auth.saveUser(user);
    this.globalData.user = user;
  },

  clearSession() {
    auth.clear();
    this.globalData.user = null;
  },

  /**
   * 页面级登录守卫。未登录时回到登录页并返回 false。
   * 返回 true 仅代表本地有 token，真正的权限校验仍由服务端完成。
   */
  requireLogin() {
    if (auth.getToken()) {
      return true;
    }
    wx.reLaunch({ url: '/pages/login/index' });
    return false;
  }
});
