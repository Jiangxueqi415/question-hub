const request = require('../utils/request');
const auth = require('../utils/auth');
const constants = require('../utils/constants');

/**
 * 真实后端接口封装（http://10.30.96.49:8080/api）
 *
 * 后端实际提供的接口：
 *   POST /auth/login   { code }                        -> { needBind, openid, user?, token? }
 *   POST /auth/bind    { openid, studentNo, nickname } -> { user, token }
 *   GET  /surveys                                      -> Survey[]
 *   GET  /surveys/my                                   -> Survey[]
 *   POST /surveys                                      -> 创建问卷（题目放在 questionsJson）
 *   POST /surveys/{id}/submit { answers }              -> 结果文案
 *   GET  /surveys/{id}/stats                           -> 统计
 *
 * 后端暂未提供：/me、/me/ledger、/me/surveys、/me/responses、/me/onboard、
 * 问卷详情、开始作答、编辑/下架。页面需要的字段在这里归一化，缺失能力通过
 * capabilities 标记，页面按“无数据”而不是假数据展示。
 */

const capabilities = {
  me: false,
  ledger: false,
  responses: false,
  onboard: false,
  updateNickname: false,
  surveyDetail: false,
  startSurvey: false,
  updateSurvey: false,
  closeSurvey: false,
  stats: true
};

const STATUS_TEXT = {
  open: '进行中',
  closed: '已下架',
  expired: '已截止',
  draft: '草稿'
};

const REWARD = 5;

function clampPoints(value) {
  const points = Number(value);
  if (isNaN(points)) return constants.POINTS_MIN;
  return Math.max(constants.POINTS_MIN, points);
}

function clampCredit(value) {
  const credit = Number(value);
  if (isNaN(credit)) return constants.CREDIT_MIN;
  return Math.max(constants.CREDIT_MIN, Math.min(constants.CREDIT_MAX, credit));
}

function rankOf(credit) {
  const score = clampCredit(credit);
  if (score >= 85) return { level: '优秀', levelTone: 'excellent' };
  if (score >= 70) return { level: '良好', levelTone: 'good' };
  if (score >= 40) return { level: '一般', levelTone: 'fair' };
  return { level: '较差', levelTone: 'poor' };
}

function unboundUser(cached) {
  return {
    id: null,
    nickname: (cached && cached.nickname) || '校园用户',
    points: 0,
    credit: 0,
    level: '较差',
    levelTone: 'poor',
    onboarded: false,
    bound: false
  };
}

function normalizeUser(user, bound) {
  const data = Object.assign({}, user || {});
  // 积分和信誉分最低为 0；信誉分上限 100。后端返回异常值时前端也兜底归一化。
  data.points = clampPoints(data.points);
  data.credit = clampCredit(data.credit);

  const rank = rankOf(data.credit);
  data.bound = data.bound === undefined ? !!bound : !!data.bound;
  data.level = data.level || rank.level;
  data.levelTone = data.levelTone || rank.levelTone;
  return data;
}

// ---------- 时间：后端 LocalDateTime 字符串 <-> 毫秒时间戳 ----------
function toTimestamp(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;

  const matched = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/
  );
  if (matched) {
    return new Date(
      Number(matched[1]),
      Number(matched[2]) - 1,
      Number(matched[3]),
      Number(matched[4]),
      Number(matched[5]),
      Number(matched[6] || 0)
    ).getTime();
  }

  const numeric = Number(value);
  return isNaN(numeric) ? 0 : numeric;
}

function toLocalDateTime(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  const two = function (n) {
    return n < 10 ? '0' + n : String(n);
  };
  return (
    date.getFullYear() +
    '-' + two(date.getMonth() + 1) +
    '-' + two(date.getDate()) +
    'T' + two(date.getHours()) +
    ':' + two(date.getMinutes()) +
    ':' + two(date.getSeconds())
  );
}

// ---------- 问卷字段归一化 ----------
function normalizeOptions(rawOptions) {
  const list = Array.isArray(rawOptions) ? rawOptions : [];
  const options = [];
  list.forEach(function (option) {
    if (option === null || option === undefined) return;
    let text = '';
    if (typeof option === 'string') {
      text = option;
    } else if (typeof option === 'object') {
      text = option.text != null ? option.text
        : option.label != null ? option.label
        : option.content != null ? option.content
        : '';
    }
    text = String(text == null ? '' : text).trim();
    if (text) options.push(text);
  });
  return options;
}

function normalizeQuestion(item, index) {
  if (!item) return null;

  let raw = item;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;

  const title = String(
    raw.title != null ? raw.title
      : raw.q != null ? raw.q
      : raw.content != null ? raw.content
      : ''
  ).trim();
  if (!title) return null;

  let type = raw.type;
  if (type === 'multi' || type === 'checkbox') type = 'multiple';
  if (type === 'text' || type === 'textarea') type = 'open';
  if (type !== 'multiple' && type !== 'open') type = 'single';

  const options = type === 'open' ? [] : normalizeOptions(raw.options);
  if (type !== 'open' && options.length < 2) return null;

  return {
    id: String(raw.id != null ? raw.id : 'q' + (index + 1)),
    type: type,
    title: title,
    options: options
  };
}

function parseQuestions(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw || '[]');
    } catch (err) {
      list = [];
    }
  }
  if (!Array.isArray(list)) {
    if (list && Array.isArray(list.questions)) {
      list = list.questions;
    } else {
      list = [];
    }
  }

  const questions = [];
  list.forEach(function (item, index) {
    const question = normalizeQuestion(item, index);
    if (question) questions.push(question);
  });
  return questions;
}

function normalizeSurvey(raw) {
  if (!raw) return null;

  const questions = parseQuestions(raw.questionsJson != null ? raw.questionsJson : raw.questions);
  const cached = auth.getCachedUser();
  const mine = !!(
    cached &&
    cached.id != null &&
    raw.ownerId != null &&
    String(cached.id) === String(raw.ownerId)
  );
  const ownerId = raw.ownerId != null ? raw.ownerId : null;
  const ownerName = raw.ownerName || raw.publisher || (
    mine && cached && cached.nickname
      ? cached.nickname
      : ownerId != null ? '用户' + ownerId : '匿名'
  );

  return {
    id: String(raw.id != null ? raw.id : ''),
    ownerId: ownerId,
    ownerName: ownerName,
    title: String(raw.title != null ? raw.title : '未命名问卷'),
    description: raw.description || '',
    category: raw.category || '其他',
    minutes: Number(raw.minutes) || 3,
    status: raw.status || 'open',
    statusText: raw.statusText || STATUS_TEXT[raw.status] || '进行中',
    startAt: toTimestamp(raw.startAt),
    endAt: toTimestamp(raw.endAt),
    createdAt: toTimestamp(raw.createdAt),
    questions: questions,
    questionCount: questions.length,
    participantCount: raw.participantCount != null
      ? Number(raw.participantCount)
      : null,
    hasResponses: !!raw.hasResponses,
    reward: REWARD,
    mine: mine
  };
}

function normalizeSurveyList(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach(function (item) {
    const survey = normalizeSurvey(item);
    if (survey && survey.id) out.push(survey);
  });
  return out;
}

// ---------- 统计归一化 ----------
function normalizeStats(raw) {
  const data = raw || {};
  const source = Array.isArray(data.questions) ? data.questions : [];
  const questions = source.map(function (item, index) {
    if (!item) return null;

    const title = String(
      item.title != null ? item.title
        : item.q != null ? item.q
        : '第' + (index + 1) + '题'
    );
    let type = item.type;
    if (type === 'multi') type = 'multiple';
    if (type === 'text' || type === 'textarea') type = 'open';
    if (type !== 'multiple' && type !== 'open') type = 'single';

    if (type === 'open') {
      const answers = [];
      (Array.isArray(item.answers) ? item.answers : []).forEach(function (answer) {
        const text = typeof answer === 'string'
          ? answer
          : answer && (answer.text != null ? answer.text : answer.content);
        if (text) answers.push(String(text));
      });
      return {
        id: String(item.id != null ? item.id : 'q' + (index + 1)),
        type: type,
        title: title,
        options: [],
        answers: answers,
        total: item.total != null ? Number(item.total) : answers.length
      };
    }

    let selectionTotal = 0;
    const options = (Array.isArray(item.options) ? item.options : []).map(function (option) {
      const text = typeof option === 'string'
        ? option
        : option && (option.text != null ? option.text : option.label != null ? option.label : option.content);
      const count = Number(
        typeof option === 'object' && option
          ? option.count != null ? option.count : option.value
          : 0
      ) || 0;
      selectionTotal += count;
      return { text: String(text == null ? '' : text), count: count };
    });

    const total = item.selectionTotal != null ? Number(item.selectionTotal) : selectionTotal;
    options.forEach(function (option) {
      option.percent = total ? Math.round((option.count / total) * 1000) / 10 : 0;
    });

    return {
      id: String(item.id != null ? item.id : 'q' + (index + 1)),
      type: type,
      title: title,
      options: options,
      selectionTotal: total
    };
  }).filter(Boolean);

  return {
    surveyId: data.surveyId,
    title: data.title || data.surveyTitle || '',
    status: data.status || 'open',
    statusText: data.statusText || STATUS_TEXT[data.status] || '',
    participantCount: data.participantCount != null
      ? Number(data.participantCount)
      : data.totalParticipants != null ? Number(data.totalParticipants) : null,
    responseCount: data.responseCount != null
      ? Number(data.responseCount)
      : data.totalResponses != null ? Number(data.totalResponses) : null,
    questions: questions
  };
}

// ---------- 微信登录 / 绑定 ----------
function wxLogin() {
  return new Promise(function (resolve, reject) {
    wx.login({
      success: function (res) {
        if (res && res.code) {
          resolve(res.code);
          return;
        }
        reject(request.makeError('WX_LOGIN_FAILED', '微信登录失败，请重试'));
      },
      fail: function () {
        reject(request.makeError('WX_LOGIN_FAILED', '微信登录失败，请重试'));
      }
    });
  });
}

function doLoginByCode(code) {
  return request({
    url: '/auth/login',
    method: 'POST',
    data: { code: code }
  }).then(function (res) {
    const data = res || {};
    if (data.openid) auth.saveOpenid(data.openid);
    if (data.token) auth.saveToken(data.token);
    if (data.user) auth.saveUser(normalizeUser(data.user, true));
    data.needBind = data.needBind === undefined ? !data.token : !!data.needBind;
    return data;
  });
}

function login(data) {
  const payload = data || {};
  if (payload.code) return doLoginByCode(payload.code);
  return wxLogin().then(doLoginByCode);
}

function bind(data) {
  const payload = data || {};

  function send(openid) {
    return request({
      url: '/auth/bind',
      method: 'POST',
      data: {
        openid: openid,
        studentNo: payload.studentNo,
        nickname: payload.nickname
      }
    }).then(function (res) {
      const result = res || {};
      const user = normalizeUser(result.user, true);
      if (result.token) auth.saveToken(result.token);
      auth.saveUser(user);
      return {
        token: result.token,
        user: user,
        needBind: false
      };
    });
  }

  if (payload.openid) return send(payload.openid);

  const savedOpenid = auth.getOpenid();
  if (savedOpenid) return send(savedOpenid);

  // 极端情况：本地没有 openid（例如缓存被清理）时，先走一次登录拿到 openid
  return wxLogin().then(doLoginByCode).then(function (res) {
    if (res && res.openid) return send(res.openid);
    throw request.makeError('INVALID_PARAMS', '登录信息已失效，请重新登录');
  });
}

function getMe() {
  const cached = auth.getCachedUser();

  return login().then(function (res) {
    const data = res || {};
    if (data.token && data.user) {
      return normalizeUser(data.user, true);
    }
    if (data.needBind || !data.token) {
      return unboundUser(cached);
    }
    if (cached) return normalizeUser(cached, true);
    return unboundUser(cached);
  }).catch(function (err) {
    // 网络异常时用本地快照兜底，避免首屏直接空白
    if (cached) return normalizeUser(cached, true);
    throw err;
  });
}

// ---------- 问卷 ----------
function getSurveys() {
  return request({ url: '/surveys?status=open' }).then(function (list) {
    return normalizeSurveyList(list).filter(function (survey) {
      return survey.status === 'open';
    });
  });
}

function getAllSurveys() {
  return request({ url: '/surveys' }).then(normalizeSurveyList);
}

function getMySurveys() {
  return request({ url: '/surveys/my' }).then(normalizeSurveyList);
}

function getSurvey(id) {
  const key = String(id == null ? '' : id);

  return getAllSurveys().then(function (list) {
    let found = null;
    list.forEach(function (survey) {
      if (survey.id === key) found = survey;
    });
    if (found) return found;

    return getMySurveys().then(function (mine) {
      let own = null;
      mine.forEach(function (survey) {
        if (survey.id === key) own = survey;
      });
      if (own) return own;
      throw request.makeError('SURVEY_NOT_FOUND', '问卷不存在或已被删除');
    });
  });
}

function buildQuestionsJson(questions) {
  return JSON.stringify((Array.isArray(questions) ? questions : []).map(function (question, index) {
    return {
      id: 'q' + (index + 1),
      type: question.type,
      title: question.title,
      options: Array.isArray(question.options) ? question.options : []
    };
  }));
}

function createSurvey(payload) {
  const data = payload || {};
  const startAt = Number(data.startAt) || Date.now();
  const endAt = Number(data.endAt) || (Date.now() + 7 * 24 * 60 * 60 * 1000);

  return request({
    url: '/surveys',
    method: 'POST',
    data: {
      title: data.title,
      description: data.description || '',
      category: data.category,
      minutes: Number(data.minutes) || 3,
      startAt: toLocalDateTime(startAt),
      endAt: toLocalDateTime(endAt),
      questionsJson: buildQuestionsJson(data.questions)
    }
  }).then(function (created) {
    return getMe().then(function (me) {
      return {
        created: created,
        points: me.points,
        credit: me.credit
      };
    }).catch(function () {
      return { created: created };
    });
  });
}

function startSurvey(id) {
  return Promise.resolve({
    attemptId: 'local_' + id + '_' + Date.now(),
    startedAt: Date.now()
  });
}

function submitSurvey(id, payload) {
  const data = payload || {};
  return request({
    url: '/surveys/' + encodeURIComponent(id) + '/submit',
    method: 'POST',
    data: { answers: data.answers || {} }
  }).then(function (res) {
    const message = typeof res === 'string'
      ? res
      : res && (res.message || res.result || res.text)
        ? (res.message || res.result || res.text)
        : '提交成功';
    return {
      status: 'submitted',
      message: String(message),
      flags: [],
      raw: res
    };
  });
}

function getSurveyStats(id) {
  return Promise.all([
    request({ url: '/surveys/' + encodeURIComponent(id) + '/stats' }),
    getSurvey(id).catch(function () {
      return null;
    })
  ]).then(function (result) {
    const stats = normalizeStats(result[0]);
    const survey = result[1];

    if (survey) {
      stats.title = stats.title || survey.title;
      stats.status = survey.status;
      stats.statusText = stats.statusText || survey.statusText;
      stats.description = survey.description;
      if (stats.participantCount === null) stats.participantCount = survey.participantCount;
    }
    return stats;
  });
}

// ---------- 后端暂未提供的接口：明确报错 / 返回空 ----------
function unsupported(message) {
  return Promise.reject(request.makeError('NOT_SUPPORTED', message));
}

const api = {
  capabilities: capabilities,

  // 身份
  login: login,
  bind: bind,

  // 用户
  getMe: getMe,
  updateNickname: function () {
    return unsupported('后端暂未提供昵称修改接口');
  },
  onboard: function () {
    return unsupported('后端暂未提供新人任务接口');
  },
  getLedger: function () {
    return Promise.resolve([]);
  },
  getMySurveys: getMySurveys,
  getMyResponses: function () {
    return Promise.resolve([]);
  },

  // 问卷
  getSurveys: getSurveys,
  getSurvey: getSurvey,
  createSurvey: createSurvey,
  startSurvey: startSurvey,
  submitSurvey: submitSurvey,
  getSurveyStats: getSurveyStats,
  updateSurvey: function () {
    return unsupported('后端暂未提供问卷编辑接口');
  },
  closeSurvey: function () {
    return unsupported('后端暂未提供问卷下架接口');
  }
};

module.exports = api;
