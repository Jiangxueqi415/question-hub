const api = require('../../services/api');

Page({
  data: {
    loading: true,
    me: {
      nickname: '校园用户',
      points: 0,
      credit: 0,
      onboarded: false
    },
    pendingSurveys: [],
    ownSurveys: [],
    completedCount: 0,
    expiredCount: 0,
    summaryText: '已完成 0 份 · 去个人中心查看',
    emptyHint: '去发布自己的问卷，邀请同学来填写'
  },

  onShow() {
    const app = getApp();
    if (!app.requireLogin()) return;
    this.loadData();
  },

  onPullDownRefresh() {
    if (this._loading) {
      wx.stopPullDownRefresh();
      return;
    }
    this.loadData(true);
  },

  loadData(fromPullDown) {
    if (this._loading) return;
    this._loading = true;
    this.setData({ loading: true });

    Promise.all([api.getMe(), api.getSurveys(), api.getMySurveys(), api.getMyResponses()])
      .then((result) => {
        const me = result[0];
        const surveys = result[1] || [];
        const mySurveys = result[2] || [];
        const responses = result[3] || [];

        let completedCount = 0;
        let expiredCount = 0;
        let failedCount = 0;
        responses.forEach(function (item) {
          if (item.status === 'valid') completedCount += 1;
          if (item.status === 'expired') expiredCount += 1;
          if (item.status === 'invalid' || item.status === 'incomplete') failedCount += 1;
        });

        let summaryText = '已完成 ' + completedCount + ' 份';
        if (failedCount) {
          summaryText += '，' + failedCount + ' 份未通过/未答完';
        }
        if (expiredCount) {
          summaryText += '，' + expiredCount + ' 份已过期';
        }
        summaryText += ' · 去个人中心查看';

        const app = getApp();
        app.updateUser(me);

        const pendingSurveys = surveys.filter(function (survey) {
          return survey.status === 'open' && !survey.mine;
        });

        this.setData({
          loading: false,
          me: me,
          pendingSurveys: pendingSurveys,
          ownSurveys: mySurveys.filter(function (survey) {
            return survey.status === 'open';
          }),
          completedCount: completedCount,
          expiredCount: expiredCount,
          summaryText: summaryText,
          emptyHint: failedCount
            ? '有 ' + failedCount + ' 份作答未通过核验，可在“我的”里查看'
            : '去发布自己的问卷，邀请同学来填写'
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      })
      .then(function () {
        // 无论成功失败都释放锁并结束下拉刷新
        this._loading = false;
        if (fromPullDown) wx.stopPullDownRefresh();
      }.bind(this));
  },

  onSurveyTap(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/detail/index?id=' + encodeURIComponent(id) });
  },

  onOwnSurveyTap(e) {
    const id = e.currentTarget.dataset.id;
    const survey = this.data.ownSurveys.filter(function (item) {
      return String(item.id) === String(id);
    })[0];
    if (!survey) return;

    wx.showModal({
      title: survey.title,
      content:
        '已收到 ' + survey.responseCount + ' 份作答（有效 ' + survey.validCount + ' 份）。' +
        '统计详情页为 P1 功能，MVP 阶段先在个人中心查看回收数量。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  onOnboard() {
    if (this._onboarding) return;
    this._onboarding = true;
    api.onboard()
      .then((res) => {
        const app = getApp();
        app.updateUser(res.user);
        this.setData({ me: res.user });
        wx.showToast({
          title: res.already ? '新人任务已领取' : '信誉分 +' + res.creditDelta,
          icon: 'none'
        });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '领取失败', icon: 'none' });
      })
      .then(() => {
        this._onboarding = false;
      });
  },

  onCreditTap() {
    wx.switchTab({ url: '/pages/profile/index' });
  },

  onViewLedger() {
    wx.switchTab({ url: '/pages/profile/index' });
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/index' });
  },

  goPublish() {
    wx.switchTab({ url: '/pages/publish/index' });
  }
});
