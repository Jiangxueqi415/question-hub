const api = require('../../services/api');
const constants = require('../../utils/constants');

const COLORS = ['#b9d4f6', '#c8e6c9', '#ffe0b2', '#f8bbd0', '#d1c4e9', '#b2ebf2'];
const BAR_COLOR = '#b9d4f6';

function buildPieStyle(counts) {
  const total = (counts || []).reduce(function (sum, count) {
    return sum + count;
  }, 0);
  if (!total) return 'background: #eef2f9;';

  let accumulated = 0;
  const stops = [];
  (counts || []).forEach(function (count, index) {
    if (!count) return;
    const start = (accumulated / total) * 100;
    accumulated += count;
    const end = (accumulated / total) * 100;
    stops.push(COLORS[index % COLORS.length] + ' ' + start.toFixed(2) + '% ' + end.toFixed(2) + '%');
  });
  return 'background: conic-gradient(' + stops.join(', ') + ');';
}

function typeText(type) {
  for (let i = 0; i < constants.QUESTION_TYPES.length; i += 1) {
    if (constants.QUESTION_TYPES[i].value === type) return constants.QUESTION_TYPES[i].label;
  }
  return '';
}

Page({
  data: {
    loading: true,
    error: '',
    mode: 'bar',
    survey: null,
    questions: [],
    participantCount: 0,
    responseCount: 0,
    statusText: '',
    closed: false
  },

  onLoad(options) {
    this.statsId = (options && options.id) || '';
    const mode = options && options.mode === 'pie' ? 'pie' : 'bar';
    this.setData({ mode: mode });

    const app = getApp();
    if (!app.requireLogin()) return;

    if (!this.statsId) {
      this.setData({ loading: false, error: '缺少问卷 id' });
      return;
    }
    this.loadStats();
  },

  loadStats() {
    this.setData({ loading: true, error: '' });
    api.getSurveyStats(this.statsId)
      .then((result) => {
        const questions = (result.questions || []).map(function (question) {
          if (question.type === 'open') {
            return Object.assign({}, question, {
              typeText: typeText(question.type),
              answers: (question.answers || []).map(function (text, index) {
                return { key: 'answer_' + index, text: text };
              })
            });
          }

          const counts = (question.options || []).map(function (option) {
            return option.count;
          });
          const selectionTotal = question.selectionTotal || counts.reduce(function (sum, count) {
            return sum + count;
          }, 0);

          return Object.assign({}, question, {
            typeText: typeText(question.type),
            pieStyle: buildPieStyle(counts),
            options: (question.options || []).map(function (option, index) {
              return {
                text: option.text,
                count: option.count,
                percent: option.percent,
                color: COLORS[index % COLORS.length],
                barColor: BAR_COLOR,
                piePercent: selectionTotal
                  ? Math.round((option.count / selectionTotal) * 1000) / 10
                  : 0
              };
            })
          });
        });

        this.setData({
          loading: false,
          error: '',
          survey: result,
          questions: questions,
          participantCount: result.participantCount || 0,
          responseCount: result.responseCount || 0,
          statusText: result.statusText || '',
          closed: result.status !== 'open'
        });
      })
      .catch((err) => {
        this.setData({
          loading: false,
          error: (err && err.message) || '加载统计失败'
        });
      });
  },

  onSwitchMode(e) {
    const mode = e.currentTarget.dataset.mode === 'pie' ? 'pie' : 'bar';
    if (mode === this.data.mode) return;
    this.setData({ mode: mode });
  },

  onEdit() {
    if (!this.statsId) return;
    try {
      wx.setStorageSync('qh_edit_survey_id', this.statsId);
    } catch (err) {
      wx.showToast({ title: '无法进入编辑，请重试', icon: 'none' });
      return;
    }
    wx.switchTab({ url: '/pages/publish/index' });
  },

  onClose() {
    if (!this.statsId) return;
    wx.showModal({
      title: '下架问卷',
      content: '下架后该问卷将不再出现在待填写列表，已提交的作答记录仍保留。确定下架？',
      confirmText: '下架',
      confirmColor: '#dc2626',
      success: (res) => {
        if (!res.confirm) return;
        api.closeSurvey(this.statsId)
          .then(() => {
            wx.showToast({ title: '已下架', icon: 'none' });
            this.loadStats();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '下架失败', icon: 'none' });
          });
      }
    });
  },

  onBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.switchTab({ url: '/pages/home/index' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index' });
  }
});
