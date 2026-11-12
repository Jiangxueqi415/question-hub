const api = require('../../services/api');
const constants = require('../../utils/constants');
const format = require('../../utils/format');
const validation = require('../../utils/validation');
const mockData = require('../../mock/mock.js');

let optionSeed = 0;

function nextKey(prefix) {
  optionSeed += 1;
  return prefix + '_' + Date.now() + '_' + optionSeed;
}

function createOption(text) {
  return {
    key: nextKey('o'),
    text: text || ''
  };
}

function optionText(option) {
  if (typeof option === 'string') return option;
  return (option && option.text) || '';
}

function templateToQuestion(question) {
  let typeIndex = 0;
  let typeLabel = '单选';
  for (let i = 0; i < constants.QUESTION_TYPES.length; i += 1) {
    if (constants.QUESTION_TYPES[i].value === question.type) {
      typeIndex = i;
      typeLabel = constants.QUESTION_TYPES[i].label;
      break;
    }
  }
  return {
    key: nextKey('tq'),
    type: question.type,
    typeIndex: typeIndex,
    typeLabel: typeLabel,
    title: question.title,
    options: (question.options || []).map(function (option) {
      return createOption(optionText(option));
    })
  };
}

Page({
  data: {
    loading: true,
    submitting: false,
    needBind: false,
    me: {
      nickname: '校园用户',
      points: 0,
      credit: 0
    },
    editingId: '',
    editingTitle: '',
    questionLocked: false,
    title: '',
    description: '',
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
    templates: mockData.TEMPLATES.map(function (template) {
      return {
        id: template.id,
        name: template.name,
        title: template.title,
        description: template.description
      };
    }),
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
    this.tryLoadEdit();
  },

  loadMe() {
    api.getMe()
      .then((me) => {
        const app = getApp();
        app.updateUser(me);
        this.setData({
          loading: false,
          me: me,
          needBind: me.bound === false
        });
        this.refreshThreshold(me);
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  tryLoadEdit() {
    let id = '';
    try {
      id = wx.getStorageSync('qh_edit_survey_id') || '';
    } catch (err) {
      id = '';
    }
    if (!id || id === this.data.editingId) return;
    try {
      wx.removeStorageSync('qh_edit_survey_id');
    } catch (err) {
      // 忽略
    }
    this.loadEditSurvey(id);
  },

  loadEditSurvey(id) {
    api.getSurvey(id)
      .then((survey) => {
        if (!survey.mine) {
          wx.showToast({ title: '只能编辑自己发布的问卷', icon: 'none' });
          return;
        }
        const categoryIndex = Math.max(0, constants.CATEGORIES.indexOf(survey.category));
        this.setData({
          loading: false,
          editingId: survey.id,
          editingTitle: survey.title,
          questionLocked: !!survey.hasResponses,
          title: survey.title,
          description: survey.description || '',
          categoryIndex: categoryIndex,
          minutes: survey.minutes,
          startDate: format.dateStr(survey.startAt),
          startTime: format.timeStr(survey.startAt),
          endDate: format.dateStr(survey.endAt),
          endTime: format.timeStr(survey.endAt),
          questions: survey.questions.map(templateToQuestion),
          formError: '',
          submitting: false
        });
        this.refreshThreshold(this.data.me);
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '加载问卷失败', icon: 'none' });
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
      key: nextKey('q'),
      type: 'single',
      typeIndex: 0,
      typeLabel: '单选',
      title: '',
      options: [createOption(), createOption()]
    };
  },

  refreshThreshold(me) {
    if (this.data.editingId) {
      this.setData({
        canPublish: true,
        thresholdHint: this.data.questionLocked
          ? '正在编辑已发布问卷：题目已锁定，保存不消耗积分。'
          : '正在编辑已发布问卷：保存不消耗积分。',
        publishButtonText: '保存修改'
      });
      return;
    }

    const user = me || this.data.me;
    if (this.data.needBind || user.bound === false) {
      this.setData({
        canPublish: false,
        thresholdHint: '请先在“我的”绑定学号后再发布问卷。',
        publishButtonText: '未绑定学号'
      });
      return;
    }

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

  onApplyTemplate(e) {
    if (this.data.questionLocked) {
      wx.showToast({ title: '已有作答，题目不可修改', icon: 'none' });
      return;
    }
    const id = e.currentTarget.dataset.id;
    let template = null;
    for (let i = 0; i < mockData.TEMPLATES.length; i += 1) {
      if (mockData.TEMPLATES[i].id === id) {
        template = mockData.TEMPLATES[i];
        break;
      }
    }
    if (!template) return;

    const hasContent =
      this.data.title.trim() ||
      this.data.questions.some(function (question) {
        return question.title.trim() || question.options.some(function (option) {
          return option.text.trim();
        });
      });

    if (hasContent) {
      wx.showModal({
        title: '应用问卷模板',
        content: '将覆盖当前已填写的标题和题目，确定使用“' + template.name + '”模板？',
        confirmText: '应用模板',
        success: (res) => {
          if (res.confirm) this.applyTemplate(template);
        }
      });
      return;
    }

    this.applyTemplate(template);
  },

  applyTemplate(template) {
    const categoryIndex = Math.max(0, constants.CATEGORIES.indexOf(template.category));
    this.setData({
      title: template.title,
      description: template.description,
      categoryIndex: categoryIndex,
      minutes: template.minutes,
      questions: template.questions.map(templateToQuestion),
      formError: '',
      questionLocked: false
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },

  onCancelEdit() {
    if (!this.data.editingId) return;
    wx.showModal({
      title: '取消编辑',
      content: '取消后将清空当前表单并恢复为新建问卷，确定吗？',
      confirmText: '取消编辑',
      confirmColor: '#dc2626',
      success: (res) => {
        if (!res.confirm) return;
        this.resetForm();
        this.refreshThreshold(this.data.me);
        wx.showToast({ title: '已取消编辑', icon: 'none' });
      }
    });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value || '', formError: '' });
  },

  onDescriptionInput(e) {
    this.setData({ description: e.detail.value || '', formError: '' });
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
    if (this.data.questionLocked) {
      wx.showToast({ title: '已有作答，题目不可修改', icon: 'none' });
      return;
    }
    if (this.data.questions.length >= constants.QUESTION_MAX) {
      wx.showToast({ title: '最多 ' + constants.QUESTION_MAX + ' 道题', icon: 'none' });
      return;
    }
    const questions = this.data.questions.slice();
    questions.push(this.createQuestion());
    this.setData({ questions: questions, formError: '' });
  },

  onRemoveQuestion(e) {
    if (this.data.questionLocked) return;
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
    if (this.data.questionLocked) return;
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
    if (this.data.questionLocked) return;
    const index = Number(e.currentTarget.dataset.index);
    const questions = this.data.questions.slice();
    questions[index] = Object.assign({}, questions[index], { title: e.detail.value || '' });
    this.setData({ questions: questions, formError: '' });
  },

  onOptionInput(e) {
    if (this.data.questionLocked) return;
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
    if (this.data.questionLocked) return;
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
    options.push(createOption());
    next.options = options;
    questions[index] = next;
    this.setData({ questions: questions, formError: '' });
  },

  onRemoveOption(e) {
    if (this.data.questionLocked) return;
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
      description: this.data.description,
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

    if (this.data.needBind) {
      this.setData({ formError: '请先在“我的”绑定学号后再发布问卷。' });
      return;
    }

    if (!this.data.editingId && !this.data.canPublish) {
      this.setData({ formError: this.data.thresholdHint });
      return;
    }

    const payload = this.buildPayload();
    const checked = validation.normalizeSurvey(payload);
    if (!checked.ok) {
      this.setData({ formError: checked.message });
      return;
    }

    if (this.data.editingId) {
      this.doUpdate(checked.value);
    } else {
      const requestId = 'publish_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      this.doCreate(Object.assign({}, checked.value, { requestId: requestId }));
    }
  },

  doCreate(data) {
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
        this.resetForm();
        this.refreshThreshold(me);
        wx.showToast({ title: '发布成功，已扣除 10 积分', icon: 'none' });
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

  doUpdate(data) {
    this.setData({ submitting: true, formError: '' });
    api.updateSurvey(this.data.editingId, data)
      .then((res) => {
        const app = getApp();
        const me = Object.assign({}, this.data.me, {
          points: res.points,
          credit: res.credit
        });
        app.updateUser(me);
        this.setData({ submitting: false, me: me });
        this.resetForm();
        this.refreshThreshold(me);
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(function () {
          wx.switchTab({ url: '/pages/profile/index' });
        }, 500);
      })
      .catch((err) => {
        this.setData({
          submitting: false,
          formError: (err && err.message) || '保存失败，请重试'
        });
      });
  },

  resetForm() {
    try {
      wx.removeStorageSync('qh_edit_survey_id');
    } catch (err) {
      // 忽略
    }
    const now = Date.now();
    this.setData({
      editingId: '',
      editingTitle: '',
      questionLocked: false,
      title: '',
      description: '',
      categoryIndex: 0,
      minutes: 3,
      startDate: format.dateStr(now),
      startTime: format.timeStr(now),
      endDate: format.dateStr(format.addDays(now, 7)),
      endTime: format.timeStr(now),
      questions: [this.createQuestion()],
      formError: ''
    });
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/index' });
  }
});
