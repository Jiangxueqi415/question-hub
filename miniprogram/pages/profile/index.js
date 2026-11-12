const api = require('../../services/api');
const config = require('../../config/index');
const format = require('../../utils/format');
const validation = require('../../utils/validation');
const mockServer = require('../../utils/mock-server');

function formatLogs(list) {
  return (list || []).map(function (entry) {
    return Object.assign({}, entry, {
      timeText: format.formatDateTime(entry.createdAt),
      deltaText: format.deltaText(entry.delta),
      direction: entry.delta > 0 ? 'up' : 'down'
    });
  });
}

function formatSurveys(list) {
  return (list || []).map(function (survey) {
    return Object.assign({}, survey, {
      deadlineText: format.formatShort(survey.endAt) + ' 截止',
      participantText: '参与 ' + (survey.participantCount || 0) + ' 人',
      tagClass: survey.status === 'open' ? 'tag--green' : 'tag--gray'
    });
  });
}

function formatResponses(list) {
  return (list || []).map(function (response) {
    let resultText = '不计积分';
    let tagClass = 'tag--gray';
    if (response.status === 'valid') {
      resultText = '+5 积分 / +5 信誉';
      tagClass = 'tag--green';
    } else if (response.status === 'invalid') {
      resultText = '不计积分';
      tagClass = 'tag--red';
    } else if (response.status === 'incomplete') {
      resultText = '不计积分 / 信誉 -5';
      tagClass = 'tag--orange';
    } else if (response.status === 'expired') {
      resultText = '不计积分 / 信誉 -20';
      tagClass = 'tag--gray';
    }
    return Object.assign({}, response, {
      timeText: format.formatDateTime(response.submittedAt),
      resultText: resultText,
      tagClass: tagClass
    });
  });
}

Page({
  data: {
    loading: true,
    logLoading: false,
    mockMode: config.useMock,
    needBind: false,
    bindStudentNo: '',
    bindNickname: '校园用户',
    bindError: '',
    bindLoading: false,
    me: {
      nickname: '校园用户',
      points: 0,
      credit: 0,
      onboarded: false
    },
    avatarText: '校',
    editingNickname: false,
    nicknameDraft: '',
    logType: 'points',
    logs: [],
    mySurveys: [],
    myResponses: []
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

    const logType = this.data.logType;

    api.getMe()
      .then((me) => {
        const app = getApp();
        app.updateUser(me);

        if (!me.bound) {
          this.setData({
            loading: false,
            needBind: true,
            me: me,
            avatarText: (me.nickname || '校园用户').slice(0, 1),
            bindNickname: this.data.bindNickname || me.nickname || '校园用户'
          });
          return null;
        }

        this.setData({
          needBind: false,
          bindError: '',
          me: me,
          avatarText: (me.nickname || '校园用户').slice(0, 1)
        });

        return Promise.all([
          api.getLedger(logType),
          api.getMySurveys(),
          api.getMyResponses()
        ]).then((result) => {
          const patch = {
            loading: false,
            mySurveys: formatSurveys(result[1]),
            myResponses: formatResponses(result[2])
          };
          if (logType === this.data.logType) {
            patch.logs = formatLogs(result[0]);
          }
          this.setData(patch);
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      })
      .then(function () {
        this._loading = false;
        if (fromPullDown) wx.stopPullDownRefresh();
      }.bind(this));
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
        this.setData({
          bindLoading: false,
          needBind: false,
          me: res.user,
          avatarText: (res.user.nickname || '校园用户').slice(0, 1)
        });
        wx.showToast({ title: '绑定成功', icon: 'success' });
        this.loadData();
      })
      .catch((err) => {
        this.setData({
          bindLoading: false,
          bindError: (err && err.message) || '绑定失败，请重试'
        });
      });
  },

  onSwitchLog(e) {
    const type = e.currentTarget.dataset.type === 'credit' ? 'credit' : 'points';
    if (type === this.data.logType) return;

    this._logRequestId = (this._logRequestId || 0) + 1;
    const requestId = this._logRequestId;

    this.setData({ logType: type, logLoading: true, logs: [] });
    api.getLedger(type)
      .then((list) => {
        if (requestId !== this._logRequestId) return;
        this.setData({ logLoading: false, logs: formatLogs(list) });
      })
      .catch((err) => {
        if (requestId !== this._logRequestId) return;
        this.setData({ logLoading: false });
        wx.showToast({ title: (err && err.message) || '加载流水失败', icon: 'none' });
      });
  },

  onOnboard() {
    if (this._onboarding) return;
    this._onboarding = true;
    api.onboard()
      .then((res) => {
        const app = getApp();
        app.updateUser(res.user);
        this.setData({
          me: res.user,
          avatarText: (res.user.nickname || '校园用户').slice(0, 1)
        });
        wx.showToast({
          title: res.already ? '新人任务已领取' : '信誉分 +' + res.creditDelta,
          icon: 'none'
        });
        this.loadData();
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '领取失败', icon: 'none' });
      })
      .then(function () {
        this._onboarding = false;
      }.bind(this));
  },

  onEditNickname() {
    this.setData({
      editingNickname: true,
      nicknameDraft: this.data.me.nickname || '校园用户'
    });
  },

  onNicknameDraftInput(e) {
    this.setData({ nicknameDraft: e.detail.value || '' });
  },

  onCancelNickname() {
    this.setData({ editingNickname: false, nicknameDraft: '' });
  },

  onSaveNickname() {
    const checked = validation.validateNickname(this.data.nicknameDraft);
    if (!checked.ok) {
      wx.showToast({ title: checked.message, icon: 'none' });
      return;
    }

    api.updateNickname(checked.value)
      .then((res) => {
        const app = getApp();
        app.updateUser(res.user);
        this.setData({
          me: res.user,
          avatarText: (res.user.nickname || '校园用户').slice(0, 1),
          editingNickname: false,
          nicknameDraft: ''
        });
        wx.showToast({ title: '昵称已更新', icon: 'success' });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '修改失败', icon: 'none' });
      });
  },

  onMySurveyTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/stats/index?id=' + encodeURIComponent(id) + '&mode=pie'
    });
  },

  onMyResponseTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    const response = this.data.myResponses[index];
    if (!response) return;

    if (!response.surveyExists) {
      wx.showModal({
        title: '问卷已删除',
        content: '发布者已删除该问卷，历史作答仍保留在记录中。',
        showCancel: false
      });
      return;
    }

    if (!response.hasAnswers) {
      wx.showModal({
        title: response.statusText,
        content: response.status === 'expired'
          ? '该问卷已过期且未提交作答，信誉 -20 分。'
          : '该记录没有可查看的作答内容。',
        showCancel: false
      });
      return;
    }

    wx.navigateTo({
      url:
        '/pages/detail/index?id=' +
        encodeURIComponent(response.surveyId) +
        '&responseId=' +
        encodeURIComponent(response.id)
    });
  },

  onResetDemo() {
    wx.showModal({
      title: '重置演示数据',
      content: '将清空登录状态、问卷、积分、信誉与流水，重新开始演示。仅 Mock 模式可用。',
      confirmText: '重置',
      confirmColor: '#dc2626',
      success: (res) => {
        if (!res.confirm) return;
        mockServer.reset();
        const app = getApp();
        app.clearSession();
        wx.reLaunch({ url: '/pages/login/index' });
      }
    });
  }
});
