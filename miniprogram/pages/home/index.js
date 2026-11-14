const api = require('../../services/api');

Page({
  data: {
    loading: true,
    needBind: false,
    notice: '',
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
    summaryText: '填写记录以后端数据为准 · 去个人中心查看',
    emptyHint: '去发布自己的问卷，邀请同学来填写',
    canOnboard: !!api.capabilities.onboard
  },

  onShow() {
    const app = getApp();
    if (!app.requireLogin()) return;
    this.showNotice();
    this.loadData();
  },

  showNotice() {
    let notice = '';
    try {
      notice = wx.getStorageSync('qh_home_notice') || '';
    } catch (err) {
      notice = '';
    }
    if (!notice) return;
    try {
      wx.removeStorageSync('qh_home_notice');
    } catch (err) {
      // 忽略
    }
    this.setData({ notice: notice });
    if (this._noticeTimer) clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => {
      this.setData({ notice: '' });
    }, 4000);
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

        // 后端未提供作答记录接口时，完成数无法核验，汇总只展示口径说明
        if (!api.capabilities.responses) {
          summaryText = '填写记录以后端数据为准 · 去个人中心查看';
        }

        const app = getApp();
        app.updateUser(me);

        const pendingSurveys = surveys.filter(function (survey) {
          return survey.status === 'open' && !survey.mine;
        });

        this.setData({
          loading: false,
          needBind: me.bound === false,
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
    if (!id) return;
    wx.navigateTo({
      url: '/pages/stats/index?id=' + encodeURIComponent(id) + '&mode=bar'
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
        let toastTitle = '新人任务已领取';
        if (!res.already) {
          toastTitle = res.creditDelta > 0 ? '信誉分 +' + res.creditDelta : '信誉分已满，未再增加';
        }
        wx.showToast({
          title: toastTitle,
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
