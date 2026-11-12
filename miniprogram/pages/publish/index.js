const api = require('../../services/api');
const constants = require('../../utils/constants');
const format = require('../../utils/format');
const validation = require('../../utils/validation');

let optionSeed = 0;

Page({
  data: {
    loading: true,
    submitting: false,
    me: {
      nickname: '校园用户',
      points: 0,
      credit: 0
    },
    title: '',
    categories: constants.CATEGORIES,
    categoryIndex: 0,
    minutes: 3,
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    questions: [],
    questionTypes: constants.QUESTION_TYPES,
    optionLetters: ['A', 'B', 'C', 'D', 'E', 'F'],
    canPublish: false,
    thresholdHint: '',
    publishButtonText: '暂不满足发布条件',
    formError: ''
  },

  onLoad() {
    this.initTimeRange();
    this.setData({ questions: [this.createQuestion()] });
  },

  onShow() {
    const app = getApp();
    if (!app.requireLogin()) return;
    this.loadMe();
  },

  loadMe() {
    api.getMe()
      .then((me) => {
        if (me.bound === false) {
          wx.reLaunch({ url: '/pages/login/index' });
          return;
        }
        const app = getApp();
        app.updateUser(me);
        this.setData({ loading: false, me: me });
        this.refreshThreshold(me);
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  initTimeRange() {
    const now = Date.now();
    this.setData({
      startDate: format.dateStr(now),
      startTime: format.timeStr(now),
      endDate: format.dateStr(format.addDays(now, 7)),
      endTime: format.timeStr(now)
    });
  },

  createQuestion() {
    return {
      key: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: 'single',
      typeIndex: 0,
      typeLabel: '单选',
      title: '',
      options: [this.createOption(), this.createOption()]
    };
  },

  createOption() {
    optionSeed += 1;
    return {
      key: 'o_' + Date.now() + '_' + optionSeed,
      text: ''
    };
  },

  refreshThreshold(me) {
    const user = me || this.data.me;
    const points = Number(user.points) || 0;
    const credit = Number(user.credit) || 0;
    const canPublish = points >= constants.PUBLISH_POINTS_COST && credit >= constants.PUBLISH_CREDIT_MIN;
    const hints = [];

    if (points < constants.PUBLISH_POINTS_COST) {
      hints.push('积分不足 10（还差 ' + (constants.PUBLISH_POINTS_COST - points) + ' 分）');
    }
    if (credit < constants.PUBLISH_CREDIT_MIN) {
      hints.push('信誉分不足 40（还差 ' + (constants.PUBLISH_CREDIT_MIN - credit) + ' 分）');
    }

    const thresholdHint = canPublish
      ? '满足发布条件：本次发布将扣除 10 积分，信誉分不扣除。'
      : hints.join('；') + '。完成他人问卷可获得 +5 积分 / +5 信誉分。';

    this.setData({
      canPublish: canPublish,
      thresholdHint: thresholdHint,
      publishButtonText: canPublish ? '消耗 10 积分发布问卷' : '暂不满足发布条件'
    });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value || '', formError: '' });
  },

  onCategoryChange(e) {
    this.setData({ categoryIndex: Number(e.detail.value) || 0, formError: '' });
  },

  onMinutesInput(e) {
    this.setData({ minutes: e.detail.value, formError: '' });
  },

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value, formError: '' });
  },

  onStartTimeChange(e) {
    this.setData({ startTime: e.detail.value, formError: '' });
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value, formError: '' });
  },

  onEndTimeChange(e) {
    this.setData({ endTime: e.detail.value, formError: '' });
  },

  onAddQuestion() {
    if (this.data.questions.length >= constants.QUESTION_MAX) {
      wx.showToast({ title: '最多 10 道题', icon: 'none' });
      return;
    }
    const questions = this.data.questions.slice();
    questions.push(this.createQuestion());
    this.setData({ questions: questions, formError: '' });
  },

  onRemoveQuestion(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (this.data.questions.length <= constants.QUESTION_MIN) {
      wx.showToast({ title: '至少保留 1 道题', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除题目',
      content: '确定删除第 ' + (index + 1) + ' 题？',
      confirmText: '删除',
      success: (res) => {
        if (!res.confirm) return;
        const questions = this.data.questions.slice();
        questions.splice(index, 1);
        this.setData({ questions: questions, formError: '' });
      }
    });
  },

  onTypeChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    const typeIndex = Number(e.detail.value);
    const type = this.data.questionTypes[typeIndex];
    if (!type) return;
    const questions = this.data.questions.slice();
    questions[index] = Object.assign({}, questions[index], {
      type: type.value,
      typeIndex: typeIndex,
      typeLabel: type.label
    });
    this.setData({ questions: questions, formError: '' });
  },

  onQuestionTitleInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const questions = this.data.questions.slice();
    questions[index] = Object.assign({}, questions[index], { title: e.detail.value || '' });
    this.setData({ questions: questions, formError: '' });
  },

  onOptionInput(e) {
    const qIndex = Number(e.currentTarget.dataset.qindex);
    const oIndex = Number(e.currentTarget.dataset.oindex);
    const questions = this.data.questions.slice();
    const question = Object.assign({}, questions[qIndex]);
    const options = question.options.slice();
    options[oIndex] = Object.assign({}, options[oIndex], { text: e.detail.value || '' });
    question.options = options;
    questions[qIndex] = question;
    this.setData({ questions: questions, formError: '' });
  },

  onAddOption(e) {
    const index = Number(e.currentTarget.dataset.index);
    const question = this.data.questions[index];
    if (!question) return;
    if (question.options.length >= constants.OPTION_MAX) {
      wx.showToast({ title: '每题最多 6 个选项', icon: 'none' });
      return;
    }
    const questions = this.data.questions.slice();
    const next = Object.assign({}, question);
    const options = question.options.slice();
    options.push(this.createOption());
    next.options = options;
    questions[index] = next;
    this.setData({ questions: questions, formError: '' });
  },

  onRemoveOption(e) {
    const qIndex = Number(e.currentTarget.dataset.qindex);
    const oIndex = Number(e.currentTarget.dataset.oindex);
    const question = this.data.questions[qIndex];
    if (!question) return;
    if (question.options.length <= constants.OPTION_MIN) {
      wx.showToast({ title: '每题至少 2 个选项', icon: 'none' });
      return;
    }
    const questions = this.data.questions.slice();
    const next = Object.assign({}, question);
    const options = question.options.slice();
    options.splice(oIndex, 1);
    next.options = options;
    questions[qIndex] = next;
    this.setData({ questions: questions, formError: '' });
  },

  buildPayload() {
    const startAt = format.parseLocalDateTime(this.data.startDate, this.data.startTime);
    const endAt = format.parseLocalDateTime(this.data.endDate, this.data.endTime);
    return {
      title: this.data.title,
      category: this.data.categories[this.data.categoryIndex],
      minutes: Number(this.data.minutes),
      startAt: startAt,
      endAt: endAt,
      questions: this.data.questions.map(function (question) {
        return {
          type: question.type,
          title: question.title,
          options: question.options.map(function (option) {
            return option.text;
          })
        };
      })
    };
  },

  onSubmit() {
    if (this.data.submitting) return;

    if (!this.data.canPublish) {
      this.setData({ formError: this.data.thresholdHint });
      return;
    }

    const payload = this.buildPayload();
    const checked = validation.normalizeSurvey(payload);
    if (!checked.ok) {
      this.setData({ formError: checked.message });
      return;
    }

    const requestId = 'publish_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const data = Object.assign({}, checked.value, { requestId: requestId });

    this.setData({ submitting: true, formError: '' });
    api.createSurvey(data)
      .then((res) => {
        const app = getApp();
        const me = Object.assign({}, this.data.me, {
          points: res.points,
          credit: res.credit
        });
        app.updateUser(me);
        this.setData({ submitting: false, me: me });
        this.refreshThreshold(me);
        wx.showToast({ title: '发布成功，已扣除 10 积分', icon: 'none' });
        this.resetForm();
        setTimeout(function () {
          wx.switchTab({ url: '/pages/home/index' });
        }, 500);
      })
      .catch((err) => {
        this.setData({
          submitting: false,
          formError: (err && err.message) || '发布失败，请重试'
        });
        if (err && (err.code === 'POINTS_NOT_ENOUGH' || err.code === 'CREDIT_NOT_ENOUGH')) {
          this.loadMe();
        }
      });
  },

  resetForm() {
    const now = Date.now();
    this.setData({
      title: '',
      categoryIndex: 0,
      minutes: 3,
      startDate: format.dateStr(now),
      startTime: format.timeStr(now),
      endDate: format.dateStr(format.addDays(now, 7)),
      endTime: format.timeStr(now),
      questions: [this.createQuestion()],
      formError: ''
    });
  }
});
