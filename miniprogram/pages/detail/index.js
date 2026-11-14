const api = require('../../services/api');
const constants = require('../../utils/constants');
const format = require('../../utils/format');

function countAnswered(questions) {
  let count = 0;
  (questions || []).forEach(function (question) {
    const value = question.value;
    if (question.type === 'single') {
      if (typeof value === 'number') count += 1;
    } else if (question.type === 'multiple') {
      if (Array.isArray(value) && value.length) count += 1;
    } else if (typeof value === 'string' && value.trim()) {
      count += 1;
    }
  });
  return count;
}

Page({
  data: {
    loading: true,
    notFound: false,
    loadError: '',
    survey: null,
    questions: [],
    total: 0,
    answeredCount: 0,
    readonly: false,
    own: false,
    needBind: false,
    showRecordAction: false,
    attemptId: '',
    startedAt: 0,
    submitting: false,
    confirming: false,
    overExpected: false,
    status: '',
    banner: '',
    bannerTone: 'info',
    submitText: '请先作答',
    submitDisabled: true,
    submitGreen: false,
    submitHint: '',
    resultTitle: '',
    resultDesc: ''
  },

  onLoad(options) {
    this.surveyId = (options && options.id) || '';
    this.responseId = (options && options.responseId) || '';
    this.survey = null;

    const app = getApp();
    if (!app.requireLogin()) return;
    this.loadSurvey();
  },

  decorateQuestions(survey, answerMap) {
    return (survey.questions || []).map(function (question) {
      let value = null;
      if (answerMap && Object.prototype.hasOwnProperty.call(answerMap, question.id)) {
        value = answerMap[question.id];
      }
      if (question.type === 'multiple' && !Array.isArray(value)) {
        value = [];
      }
      if (question.type === 'open' && typeof value !== 'string') {
        value = '';
      }
      return {
        id: question.id,
        type: question.type,
        title: question.title,
        options: question.options || [],
        value: value
      };
    });
  },

  loadSurvey() {
    if (!this.surveyId) {
      this.setData({ loading: false, notFound: true });
      return;
    }

    Promise.all([api.getSurvey(this.surveyId), api.getMe()])
      .then((result) => {
        const survey = result[0];
        const me = result[1];
        this.survey = survey;

        const view = Object.assign({}, survey, {
          startText: format.formatDateTime(survey.startAt),
          endText: format.formatDateTime(survey.endAt),
          createdText: format.formatDateTime(survey.createdAt),
          participantCount: survey.participantCount != null ? survey.participantCount : null
        });

        this.setData({
          loading: false,
          survey: view,
          questions: this.decorateQuestions(survey),
          total: survey.questions.length,
          status: survey.status,
          needBind: me.bound === false
        });
        this.refreshSubmitState();

        if (me.bound === false) {
          this.setupUnbound();
          return null;
        }
        if (survey.mine) {
          this.setupOwn();
          return null;
        }

        return api.getMyResponses().then((responses) => {
          let response = null;
          if (this.responseId) {
            response = responses.filter(function (item) {
              return (
                String(item.id) === String(this.responseId) &&
                String(item.surveyId) === String(survey.id)
              );
            }, this)[0];
          }
          if (!response) {
            response = responses.filter(function (item) {
              return String(item.surveyId) === String(survey.id);
            })[0];
          }
          if (response) {
            this.applyResponse(response);
            return null;
          }
          if (survey.status !== 'open') {
            this.setupBlocked();
            return null;
          }
          return this.startAttempt(survey);
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        if (err && err.code === 'SURVEY_NOT_FOUND') {
          this.setData({ notFound: true, loadError: '' });
          return;
        }
        this.setData({ loadError: (err && err.message) || '加载失败，请稍后重试' });
      });
  },

  startAttempt(survey) {
    return api.startSurvey(survey.id)
      .then((res) => {
        this.setData({
          attemptId: res.attemptId,
          startedAt: res.startedAt,
          readonly: false,
          confirming: false,
          overExpected: false,
          banner: '',
          bannerTone: 'info'
        });
        this.refreshSubmitState();
      })
      .catch((err) => {
        if (err && err.code === 'ALREADY_SUBMITTED' && err.response) {
          this.applyResponse(err.response);
          return;
        }
        if (err && err.code === 'SELF_ANSWER_FORBIDDEN') {
          this.setupOwn();
          return;
        }
        if (err && err.code === 'SURVEY_CLOSED') {
          this.setupBlocked(err.message);
          return;
        }
        if (err && err.code === 'STUDENT_NOT_BOUND') {
          this.setupUnbound();
          return;
        }
        wx.showToast({ title: (err && err.message) || '无法进入作答', icon: 'none' });
        this.setupBlocked('无法进入作答，请返回首页重试', '无法作答');
      });
  },

  setupUnbound() {
    this.setData({
      needBind: true,
      readonly: true,
      startedAt: 0,
      confirming: false,
      overExpected: false,
      banner: '请先在“我的”绑定学号后再作答。',
      bannerTone: 'gray',
      submitText: '未绑定学号',
      submitDisabled: true,
      submitGreen: false,
      submitHint: '',
      resultTitle: '未绑定学号',
      resultDesc: '绑定学号后即可作答、领取积分和发布问卷。',
      showRecordAction: false
    });
  },

  setupOwn() {
    this.setData({
      own: true,
      needBind: false,
      readonly: true,
      startedAt: 0,
      confirming: false,
      overExpected: false,
      banner: '这是你发布的问卷，发布者不能作答自己的问卷。',
      bannerTone: 'gray',
      submitText: '发布者不可作答',
      submitDisabled: true,
      submitGreen: false,
      submitHint: '',
      resultTitle: '发布者视角',
      resultDesc: '可以查看每一题的答题统计。',
      showRecordAction: false
    });
  },

  setupBlocked(message, title) {
    this.setData({
      readonly: true,
      needBind: false,
      startedAt: 0,
      confirming: false,
      overExpected: false,
      banner: message || '问卷已截止，无法作答。',
      bannerTone: 'gray',
      submitText: '问答已截止，作答无效',
      submitDisabled: true,
      submitGreen: false,
      submitHint: '',
      resultTitle: title || '问卷已截止',
      resultDesc: '该问卷当前不可作答，已提交的记录仍可在个人中心查看。',
      showRecordAction: false
    });
  },

  applyResponse(response) {
    const answeredMap = response.answers || {};
    const questions = this.decorateQuestions(this.survey, answeredMap);
    const answeredCount = countAnswered(questions);
    const flags = response.flagLabels || [];
    const flagText = flags.join('、');
    let banner = '';
    let tone = 'gray';
    let resultDesc = '';

    if (response.status === 'valid') {
      banner = flagText
        ? '已完成填写（本次异常标记：' + flagText + '，已记录）'
        : '已完成填写，获得 +5 积分、+5 信誉分';
      tone = 'success';
      resultDesc = banner;
    } else if (response.status === 'invalid') {
      banner = '未通过质量核验：' + flagText + '。本次不计积分。';
      tone = 'danger';
      resultDesc = banner;
    } else if (response.status === 'incomplete') {
      banner = '未答完，本次不计积分，信誉 -5。';
      tone = 'warn';
      resultDesc = banner + ' 该问卷不可重答。';
    } else if (response.status === 'expired') {
      banner = '已过期未提交，信誉 -20。';
      tone = 'gray';
      resultDesc = banner;
    }

    this.setData({
      readonly: true,
      needBind: false,
      startedAt: 0,
      confirming: false,
      overExpected: false,
      showRecordAction: true,
      questions: questions,
      answeredCount: answeredCount,
      status: response.status,
      banner: banner,
      bannerTone: tone,
      submitText: constants.RESPONSE_STATUS_TEXT[response.status] || '已提交',
      submitDisabled: true,
      submitGreen: false,
      submitHint: '',
      resultTitle: constants.RESPONSE_STATUS_TEXT[response.status] || '提交结果',
      resultDesc: resultDesc
    });
  },

  refreshSubmitState(questions) {
    if (this.data.readonly) return;
    const list = questions || this.data.questions;
    const total = list.length;
    const answered = countAnswered(list);
    let submitText = '请先作答';
    let submitDisabled = true;
    let submitGreen = false;
    let submitHint = '';

    if (answered > 0 && answered < total) {
      submitGreen = true;
      submitDisabled = false;
      if (this.data.confirming) {
        submitText = '再次点击确认提交';
        submitHint = '您还有 ' + (total - answered) + ' 题未作答，确认提交？';
      } else {
        submitText = '提交问卷（还差 ' + (total - answered) + ' 题）';
        submitHint = '还有题目未答，提交前会提示确认；提交后不可修改。';
      }
    } else if (total > 0 && answered === total) {
      submitText = '提交问卷并领取积分';
      submitDisabled = false;
      submitGreen = true;
      submitHint = '提交后不可修改，请在截止时间前完成。';
    }

    this.setData({
      answeredCount: answered,
      total: total,
      submitText: submitText,
      submitDisabled: submitDisabled,
      submitGreen: submitGreen,
      submitHint: submitHint
    });
  },

  onAnswerChange(e) {
    if (this.data.readonly) return;
    const index = e.detail.index;
    const value = e.detail.value;
    const questions = this.data.questions.slice();
    questions[index] = Object.assign({}, questions[index], { value: value });
    this.setData({
      questions: questions,
      confirming: false
    });
    this.refreshSubmitState(questions);
  },

  onTimerTick(e) {
    const seconds = Number(e.detail && e.detail.seconds) || 0;
    const minutes = Number(this.data.survey && this.data.survey.minutes) || 0;
    const over = minutes > 0 && seconds > minutes * 60;
    if (over !== this.data.overExpected) {
      this.setData({ overExpected: over });
    }
  },

  buildAnswers() {
    const answers = {};
    this.data.questions.forEach(function (question) {
      const value = question.value;
      if (question.type === 'single') {
        if (typeof value === 'number') answers[question.id] = value;
        return;
      }
      if (question.type === 'multiple') {
        if (Array.isArray(value) && value.length) answers[question.id] = value;
        return;
      }
      if (typeof value === 'string' && value.trim()) {
        answers[question.id] = value.trim();
      }
    });
    return answers;
  },

  onSubmit() {
    if (this.data.readonly || this.data.submitting || this.data.submitDisabled) return;
    if (!this.data.attemptId) {
      wx.showToast({ title: '作答记录失效，请重新进入', icon: 'none' });
      return;
    }

    const unanswered = this.data.total - this.data.answeredCount;
    if (unanswered > 0 && !this.data.confirming) {
      this.setData({ confirming: true });
      this.refreshSubmitState();
      return;
    }

    this.doSubmit();
  },

  doSubmit() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    const requestId = 'submit_' + this.surveyId + '_' + Date.now();
    api.submitSurvey(this.surveyId, {
      attemptId: this.data.attemptId,
      answers: this.buildAnswers(),
      requestId: requestId
    })
      .then((result) => {
        this.setData({ submitting: false });
        this.showSubmitResult(result);
        // 后端在提交时结算积分/信誉，重新拉取用户快照刷新首页与“我的”
        api.getMe().then((me) => {
          if (me && me.bound !== false) {
            getApp().updateUser(me);
          }
        }).catch(function () {
          // 用户快照刷新失败不影响提交结果展示
        });
      })
      .catch((err) => {
        this.setData({ submitting: false });
        if (err && err.code === 'ALREADY_SUBMITTED' && err.response) {
          this.applyResponse(err.response);
          wx.showToast({ title: '已领取过，返回首次结果', icon: 'none' });
          return;
        }
        if (err && err.code === 'ATTEMPT_EXPIRED') {
          this.setupBlocked(err.message, '提交失败');
          wx.showModal({
            title: '提交失败',
            content: err.message || '问卷已截止，本次作答无效',
            showCancel: false,
            confirmText: '返回首页',
            success: function () {
              wx.switchTab({ url: '/pages/home/index' });
            }
          });
          return;
        }
        if (err && err.code === 'STUDENT_NOT_BOUND') {
          this.setupUnbound();
          return;
        }
        wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
      });
  },

  showSubmitResult(result) {
    const status = result.status;
    const flags = result.flags || [];
    const message = result.message || '';

    // 真实后端提交接口只返回结果文案，没有 valid/invalid 等结构化状态
    if (status === 'submitted') {
      this.setData({
        readonly: true,
        needBind: false,
        startedAt: 0,
        confirming: false,
        overExpected: false,
        showRecordAction: true,
        status: status,
        banner: message,
        bannerTone: 'success',
        submitDisabled: true,
        submitGreen: false,
        submitHint: '',
        submitText: '已提交',
        resultTitle: '提交结果',
        resultDesc: message
      });
      wx.showModal({
        title: '提交结果',
        content: message,
        showCancel: false,
        confirmText: '返回首页',
        success: function () {
          wx.switchTab({ url: '/pages/home/index' });
        }
      });
      return;
    }

    const tone = status === 'valid' ? 'success' : status === 'invalid' ? 'danger' : 'warn';
    const titleMap = {
      valid: '已完成填写',
      invalid: '未通过质量核验',
      incomplete: '本次作答未答完',
      expired: '已过期'
    };

    if (flags.indexOf('fast') !== -1) {
      try {
        wx.setStorageSync('qh_home_notice', '请认真作答');
      } catch (err) {
        // 忽略存储异常
      }
    }

    this.setData({
      readonly: true,
      needBind: false,
      startedAt: 0,
      confirming: false,
      overExpected: false,
      showRecordAction: true,
      status: status,
      banner: message,
      bannerTone: tone,
      submitDisabled: true,
      submitGreen: false,
      submitHint: '',
      submitText: constants.RESPONSE_STATUS_TEXT[status] || '已提交',
      resultTitle: titleMap[status] || '提交结果',
      resultDesc: message
    });

    // 正常有效提交与 2 秒内的快速提交：直接回首页（快速提交会在首页提示“请认真作答”）
    if (status === 'valid' || flags.indexOf('fast') !== -1) {
      wx.showToast({ title: message, icon: 'none', duration: 1800 });
      setTimeout(function () {
        wx.switchTab({ url: '/pages/home/index' });
      }, 900);
      return;
    }

    wx.showModal({
      title: '提交结果',
      content: message,
      showCancel: false,
      confirmText: '返回首页',
      success: function () {
        wx.switchTab({ url: '/pages/home/index' });
      }
    });
  },

  onViewStats() {
    if (!this.surveyId) return;
    wx.navigateTo({
      url: '/pages/stats/index?id=' + encodeURIComponent(this.surveyId) + '&mode=bar'
    });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index' });
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/index' });
  }
});
