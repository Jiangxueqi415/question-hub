/**
 * 本地 Mock 服务（仅供开发/演示）
 *
 * 作用：在还没有后端时，把 PRD 第 9 节的接口和第 6/7 节的核心规则跑起来，
 *      让 5 个页面可以走通“登录绑定 → 新人任务 → 作答 → 领取 → 发布 → 流水”。
 *
 * 注意：
 * 1. 本文件模拟的是“服务端”，页面不得绕过 services/api.js 直接改这里的数据；
 * 2. 学号在这里只存一个假哈希，真实后端必须使用 HMAC-SHA256 + 服务端盐值；
 * 3. 计时、判重、幂等、质量核验、结算在真实环境必须全部由服务端完成，
 *    小程序端只负责展示结果。
 */
const constants = require('./constants');
const format = require('./format');
const validation = require('./validation');

const STORE_KEY = 'qh_mock_state_v1';
const STATE_VERSION = 1;
const MOCK_TOKEN = 'mock-token';
const LATENCY_MS = 120;
const LOG_KEEP = 120;
const DAY = 24 * 60 * 60 * 1000;

function apiError(code, message) {
  const err = new Error(message || constants.ERROR_MESSAGES[code] || '请求失败');
  err.code = code || 'SERVER_ERROR';
  return err;
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * 仅用于 Mock 的假哈希。真实环境：HMAC_SHA256(salt, studentNo)，盐值只在服务端。
 */
function mockHash(value) {
  const text = String(value || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return 'mock$' + Math.abs(hash).toString(16);
}

function makeQuestion(id, type, title, options) {
  return {
    id: id,
    type: type,
    title: title,
    sort: 0,
    options: (options || []).map(function (text, index) {
      return { id: id + '_o' + (index + 1), text: text, sort: index };
    })
  };
}

function makeSeedSurvey(id, ownerId, ownerName, title, category, minutes, questions, createdAt, startAt, endAt) {
  return {
    id: id,
    ownerId: ownerId,
    ownerName: ownerName,
    title: title,
    category: category,
    minutes: minutes,
    startAt: startAt,
    endAt: endAt,
    status: 'open',
    createdAt: createdAt,
    questions: questions
  };
}

function createSeedSurveys(now) {
  const startAt = now - 30 * DAY;
  const endAt = now + 30 * DAY;

  const survey1 = makeSeedSurvey(
    's1',
    'u_demo_1',
    '林同学',
    '大学生网购消费习惯调查',
    '生活服务',
    3,
    [
      makeQuestion('s1q1', 'single', '你平均每月网购几次？', ['1-2 次', '3-5 次', '6-10 次', '10 次以上']),
      makeQuestion('s1q2', 'single', '你常用的购物平台是？', ['淘宝 / 天猫', '京东', '拼多多', '抖音 / 快手']),
      makeQuestion('s1q3', 'single', '你单次网购的平均金额是？', ['50 元以内', '50-200 元', '200-500 元', '500 元以上']),
      makeQuestion('s1q4', 'single', '影响你下单的主要因素是？', ['价格优惠', '商品评价', '物流速度', '品牌口碑'])
    ],
    now - 60 * 1000,
    startAt,
    endAt
  );

  const survey2 = makeSeedSurvey(
    's2',
    'u_demo_2',
    '周同学',
    '关于校园食堂满意度的调研',
    '学习调研',
    2,
    [
      makeQuestion('s2q1', 'single', '你每周在食堂就餐几次？', ['1-3 次', '4-6 次', '7-10 次', '10 次以上']),
      makeQuestion('s2q2', 'single', '你对食堂菜品的口味满意吗？', ['非常满意', '比较满意', '一般', '不满意']),
      makeQuestion('s2q3', 'multiple', '你最希望食堂改进什么？（可多选）', ['口味', '价格', '卫生', '排队效率', '营业时间']),
      makeQuestion('s2q4', 'open', '你对食堂还有什么建议？', [])
    ],
    now - 120 * 1000,
    startAt,
    endAt
  );

  const survey3 = makeSeedSurvey(
    's3',
    'u_demo_3',
    '陈同学',
    '社团活动参与意愿调查',
    '社团活动',
    4,
    [
      makeQuestion('s3q1', 'single', '你目前参加了几个社团？', ['0 个', '1 个', '2 个', '3 个及以上']),
      makeQuestion('s3q2', 'multiple', '你更愿意参加哪类社团活动？（可多选）', ['学术讲座', '志愿服务', '文体比赛', '户外拓展']),
      makeQuestion('s3q3', 'open', '你希望社团增加什么活动？', [])
    ],
    now - 180 * 1000,
    startAt,
    endAt
  );

  return [survey1, survey2, survey3];
}

function createState() {
  const now = Date.now();
  return {
    version: STATE_VERSION,
    createdAt: now,
    user: {
      id: 'u_self',
      openid: 'mock-openid-self',
      nickname: '校园用户',
      studentHash: '',
      bound: false,
      onboarded: false,
      points: constants.INITIAL_POINTS,
      credit: constants.INITIAL_CREDIT,
      createdAt: now
    },
    boundHashes: {},
    surveys: createSeedSurveys(now),
    attempts: [],
    responses: [],
    pointLedger: [],
    creditLedger: [],
    // requestId -> 首次成功结果，用于发布/提交幂等
    requests: {}
  };
}

function loadState() {
  let state = null;
  try {
    state = wx.getStorageSync(STORE_KEY);
  } catch (err) {
    state = null;
  }
  if (!state || typeof state !== 'object' || state.version !== STATE_VERSION) {
    state = createState();
    saveState(state);
  }
  return state;
}

function saveState(state) {
  try {
    wx.setStorageSync(STORE_KEY, state);
  } catch (err) {
    console.warn('[mock] 本地数据写入失败', err);
  }
}

function reset() {
  try {
    wx.removeStorageSync(STORE_KEY);
  } catch (err) {
    // 忽略
  }
}

function publicUser(state) {
  const user = state.user;
  const level = format.levelOf(user.credit);
  return {
    id: user.id,
    nickname: user.nickname,
    points: user.points,
    credit: user.credit,
    level: level.name,
    levelTone: level.tone,
    onboarded: user.onboarded,
    bound: user.bound
  };
}

function requireBound(state) {
  if (!state.user.bound) {
    throw apiError('AUTH_REQUIRED', '请先登录并绑定学号');
  }
}

function effectiveStatus(survey, now) {
  if (survey.status === 'closed') return 'closed';
  return survey.endAt > now ? 'open' : 'closed';
}

function findSurvey(state, id) {
  for (let i = 0; i < state.surveys.length; i += 1) {
    if (String(state.surveys[i].id) === String(id)) return state.surveys[i];
  }
  return null;
}

function findResponse(state, surveyId, userId) {
  for (let i = 0; i < state.responses.length; i += 1) {
    const item = state.responses[i];
    if (String(item.surveyId) === String(surveyId) && String(item.userId) === String(userId)) {
      return item;
    }
  }
  return null;
}

function findAttempt(state, attemptId, surveyId, userId) {
  for (let i = 0; i < state.attempts.length; i += 1) {
    const item = state.attempts[i];
    if (
      String(item.id) === String(attemptId) &&
      String(item.surveyId) === String(surveyId) &&
      String(item.userId) === String(userId)
    ) {
      return item;
    }
  }
  return null;
}

function pushPointLedger(state, delta, reason, surveyId) {
  state.pointLedger.unshift({
    id: uid('pl'),
    userId: state.user.id,
    delta: delta,
    reason: reason,
    surveyId: surveyId || '',
    balanceAfter: state.user.points,
    createdAt: Date.now()
  });
  if (state.pointLedger.length > LOG_KEEP) state.pointLedger.length = LOG_KEEP;
}

function pushCreditLedger(state, delta, reason, surveyId) {
  state.creditLedger.unshift({
    id: uid('cl'),
    userId: state.user.id,
    delta: delta,
    reason: reason,
    surveyId: surveyId || '',
    balanceAfter: state.user.credit,
    createdAt: Date.now()
  });
  if (state.creditLedger.length > LOG_KEEP) state.creditLedger.length = LOG_KEEP;
}

/**
 * 信誉分变动，返回实际变动值（可能因 0–100 边界被截断）。
 */
function addCredit(state, delta, reason, surveyId) {
  const before = state.user.credit;
  let next = before + delta;
  next = Math.max(constants.CREDIT_MIN, Math.min(constants.CREDIT_MAX, next));
  const actual = next - before;
  state.user.credit = next;
  if (actual !== 0) {
    pushCreditLedger(state, actual, reason, surveyId);
  }
  return actual;
}

function login(state) {
  return {
    token: MOCK_TOKEN,
    user: publicUser(state),
    needBind: !state.user.bound
  };
}

function bind(state, data) {
  if (state.user.bound) {
    throw apiError('STUDENT_ALREADY_BOUND', '当前微信已绑定学号');
  }
  const checked = validation.validateBind(data);
  if (!checked.ok) {
    throw apiError('INVALID_PARAMS', checked.message);
  }
  const studentHash = mockHash(checked.value.studentNo);
  if (state.boundHashes[studentHash] && state.boundHashes[studentHash] !== state.user.id) {
    throw apiError('STUDENT_ALREADY_BOUND', '该学号已绑定其他微信，请联系管理员');
  }
  state.boundHashes[studentHash] = state.user.id;
  state.user.studentHash = studentHash;
  state.user.nickname = checked.value.nickname;
  state.user.bound = true;
  return {
    token: MOCK_TOKEN,
    user: publicUser(state),
    needBind: false
  };
}

function updateNickname(state, data) {
  const checked = validation.validateNickname(data && data.nickname);
  if (!checked.ok) {
    throw apiError('INVALID_PARAMS', checked.message);
  }
  state.user.nickname = checked.value;
  return { user: publicUser(state) };
}

function onboard(state) {
  if (state.user.onboarded) {
    return { user: publicUser(state), creditDelta: 0, already: true };
  }
  state.user.onboarded = true;
  const creditDelta = addCredit(state, constants.ONBOARD_CREDIT, '新人任务：阅读互助规则', null);
  return { user: publicUser(state), creditDelta: creditDelta, already: false };
}

function listSurveys(state) {
  const now = Date.now();
  return state.surveys
    .filter(function (survey) {
      return effectiveStatus(survey, now) === 'open';
    })
    .filter(function (survey) {
      return survey.ownerId !== state.user.id;
    })
    .filter(function (survey) {
      return !findResponse(state, survey.id, state.user.id);
    })
    .sort(function (a, b) {
      return b.createdAt - a.createdAt;
    })
    .map(function (survey) {
      return {
        id: survey.id,
        title: survey.title,
        ownerName: survey.ownerName,
        category: survey.category,
        minutes: survey.minutes,
        questionCount: survey.questions.length,
        reward: constants.REWARD_POINTS,
        startAt: survey.startAt,
        endAt: survey.endAt,
        status: 'open',
        mine: false
      };
    });
}

function getSurveyDetail(state, id) {
  const survey = findSurvey(state, id);
  if (!survey) {
    throw apiError('SURVEY_NOT_FOUND');
  }
  return {
    id: survey.id,
    title: survey.title,
    ownerName: survey.ownerName,
    category: survey.category,
    minutes: survey.minutes,
    reward: constants.REWARD_POINTS,
    startAt: survey.startAt,
    endAt: survey.endAt,
    status: effectiveStatus(survey, Date.now()),
    mine: survey.ownerId === state.user.id,
    questions: survey.questions.map(function (question) {
      return {
        id: question.id,
        type: question.type,
        title: question.title,
        options: question.options.map(function (option) {
          return { id: option.id, text: option.text };
        })
      };
    })
  };
}

function createSurvey(state, data) {
  const payload = data || {};
  const requestId = String(payload.requestId || '');
  if (requestId && state.requests[requestId]) {
    return state.requests[requestId];
  }

  if (state.user.credit < constants.PUBLISH_CREDIT_MIN) {
    throw apiError('CREDIT_NOT_ENOUGH', '信誉分不足 40，请先完成新人任务或他人问卷');
  }
  if (state.user.points < constants.PUBLISH_POINTS_COST) {
    throw apiError('POINTS_NOT_ENOUGH', '积分不足 10，请先完成 2 份他人问卷');
  }

  const checked = validation.normalizeSurvey(payload);
  if (!checked.ok) {
    throw apiError('INVALID_PARAMS', checked.message);
  }

  const now = Date.now();
  const survey = {
    id: uid('s'),
    ownerId: state.user.id,
    ownerName: state.user.nickname,
    title: checked.value.title,
    category: checked.value.category,
    minutes: checked.value.minutes,
    startAt: checked.value.startAt,
    endAt: checked.value.endAt,
    status: 'open',
    createdAt: now,
    questions: checked.value.questions.map(function (question, qIndex) {
      return {
        id: 'q_' + now.toString(36) + '_' + qIndex,
        type: question.type,
        title: question.title,
        sort: qIndex,
        options: question.options.map(function (text, oIndex) {
          return {
            id: 'o_' + now.toString(36) + '_' + qIndex + '_' + oIndex,
            text: text,
            sort: oIndex
          };
        })
      };
    })
  };

  state.surveys.push(survey);
  state.user.points -= constants.PUBLISH_POINTS_COST;
  pushPointLedger(state, -constants.PUBLISH_POINTS_COST, '发布问卷：《' + survey.title + '》', survey.id);

  const result = {
    id: survey.id,
    points: state.user.points,
    credit: state.user.credit
  };
  if (requestId) state.requests[requestId] = result;
  return result;
}

function startSurvey(state, id) {
  const survey = findSurvey(state, id);
  if (!survey) {
    throw apiError('SURVEY_NOT_FOUND');
  }
  if (survey.ownerId === state.user.id) {
    throw apiError('SELF_ANSWER_FORBIDDEN');
  }
  if (effectiveStatus(survey, Date.now()) !== 'open') {
    throw apiError('SURVEY_CLOSED', '问卷已截止，暂不可作答');
  }

  const response = findResponse(state, survey.id, state.user.id);
  if (response) {
    const err = apiError('ALREADY_SUBMITTED');
    err.response = toPublicResponse(state, response);
    throw err;
  }

  let attempt = null;
  for (let i = 0; i < state.attempts.length; i += 1) {
    const item = state.attempts[i];
    if (
      String(item.surveyId) === String(survey.id) &&
      String(item.userId) === String(state.user.id) &&
      item.status === 'in_progress'
    ) {
      attempt = item;
      break;
    }
  }

  if (!attempt) {
    attempt = {
      id: uid('att'),
      surveyId: survey.id,
      userId: state.user.id,
      startedAt: Date.now(),
      submittedAt: 0,
      status: 'in_progress',
      endAt: survey.endAt
    };
    state.attempts.push(attempt);
  }

  return {
    attemptId: attempt.id,
    startedAt: attempt.startedAt,
    endAt: attempt.endAt,
    status: attempt.status
  };
}

function normalizeAnswers(survey, raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const answers = {};
  let answered = 0;

  survey.questions.forEach(function (question) {
    const value = source[question.id];
    if (question.type === 'single') {
      const index = Number(value);
      if (Number.isInteger(index) && index >= 0 && index < question.options.length) {
        answers[question.id] = index;
        answered += 1;
      }
      return;
    }
    if (question.type === 'multiple') {
      if (!Array.isArray(value)) return;
      const picked = [];
      value.forEach(function (item) {
        const index = Number(item);
        if (
          Number.isInteger(index) &&
          index >= 0 &&
          index < question.options.length &&
          picked.indexOf(index) === -1
        ) {
          picked.push(index);
        }
      });
      picked.sort(function (a, b) {
        return a - b;
      });
      if (picked.length) {
        answers[question.id] = picked;
        answered += 1;
      }
      return;
    }
    const text = typeof value === 'string' ? value.trim() : '';
    if (text) {
      answers[question.id] = text.slice(0, constants.OPEN_ANSWER_MAX_LEN);
      answered += 1;
    }
  });

  return {
    answers: answers,
    answered: answered,
    missedCount: survey.questions.length - answered
  };
}

function openAnswerInvalid(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (constants.QUALITY.OPEN_WHITELIST.indexOf(value) !== -1) return false;
  if (value.length < constants.QUALITY.OPEN_MIN_CHARS) return true;

  const counts = {};
  let max = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charAt(i);
    counts[ch] = (counts[ch] || 0) + 1;
    if (counts[ch] > max) max = counts[ch];
  }
  return max / value.length >= constants.QUALITY.STRAIGHT_RATE;
}

/**
 * 质量核验（PRD 6.5）：
 * - 未答率 > 20%：incomplete
 * - 否则收集 flags：fast / straight / open_invalid
 * - flags >= 2：invalid；flags <= 1：valid（1 个 flag 只做记录）
 */
function evaluateQuality(survey, answers, attempt, now) {
  const total = survey.questions.length;
  const answered = Object.keys(answers).length;
  const missedCount = total - answered;
  const missRate = total > 0 ? missedCount / total : 0;
  const elapsedSeconds = Math.max(0, (now - attempt.startedAt) / 1000);

  if (missRate > constants.QUALITY.MISS_RATE) {
    return {
      status: 'incomplete',
      flags: [],
      missedCount: missedCount,
      elapsedSeconds: elapsedSeconds
    };
  }

  const flags = [];

  if (elapsedSeconds < constants.QUALITY.MIN_SECONDS) {
    flags.push('fast');
  }

  const choicePicks = [];
  survey.questions.forEach(function (question) {
    if (question.type === 'single' && typeof answers[question.id] === 'number') {
      choicePicks.push(answers[question.id]);
    } else if (
      question.type === 'multiple' &&
      Array.isArray(answers[question.id]) &&
      answers[question.id].length
    ) {
      choicePicks.push(answers[question.id][0]);
    }
  });

  if (choicePicks.length >= 2) {
    const counts = {};
    let max = 0;
    choicePicks.forEach(function (index) {
      counts[index] = (counts[index] || 0) + 1;
      if (counts[index] > max) max = counts[index];
    });
    if (max / choicePicks.length >= constants.QUALITY.STRAIGHT_RATE) {
      flags.push('straight');
    }
  }

  let hasOpenInvalid = false;
  survey.questions.forEach(function (question) {
    if (question.type !== 'open') return;
    const text = answers[question.id];
    if (typeof text !== 'string') return;
    if (openAnswerInvalid(text)) {
      hasOpenInvalid = true;
    }
  });
  if (hasOpenInvalid) {
    flags.push('open_invalid');
  }

  return {
    status: flags.length >= 2 ? 'invalid' : 'valid',
    flags: flags,
    missedCount: missedCount,
    elapsedSeconds: elapsedSeconds
  };
}

function addPoints(state, delta, reason, surveyId) {
  state.user.points = Math.max(0, state.user.points + delta);
  pushPointLedger(state, delta, reason, surveyId);
  return delta;
}

function flagLabels(flags) {
  return (flags || []).map(function (flag) {
    return constants.FLAG_LABELS[flag] || flag;
  });
}

function statusMessage(status, flags, missedCount) {
  const labels = flagLabels(flags);
  if (status === 'valid') {
    if (labels.length) {
      return '提交成功：+5 积分、+5 信誉分（本次有 1 项异常标记：' + labels.join('、') + '，已记录）';
    }
    return '提交成功：+5 积分、+5 信誉分';
  }
  if (status === 'invalid') {
    return '未通过质量核验：' + labels.join('、') + '。本次不计积分。';
  }
  if (status === 'incomplete') {
    return '未答完：还有 ' + missedCount + ' 题未答。本次不计积分，信誉 -5。';
  }
  if (status === 'expired') {
    return '问卷已截止，本次作答无效。';
  }
  return '';
}

function buildSubmitResult(state, response, survey, missedCount) {
  const flags = response.flags || [];
  let pointsDelta = 0;
  let creditDelta = 0;
  if (response.status === 'valid') {
    pointsDelta = constants.REWARD_POINTS;
    creditDelta = constants.REWARD_CREDIT;
  } else if (response.status === 'incomplete') {
    creditDelta = -constants.INCOMPLETE_CREDIT_PENALTY;
  } else if (response.status === 'expired') {
    creditDelta = -constants.EXPIRED_CREDIT_PENALTY;
  }
  const missed =
    typeof missedCount === 'number'
      ? missedCount
      : Math.max(0, survey.questions.length - Object.keys(response.answers || {}).length);

  return {
    responseId: response.id,
    status: response.status,
    flags: flags,
    flagLabels: flagLabels(flags),
    pointsDelta: pointsDelta,
    creditDelta: creditDelta,
    points: state.user.points,
    credit: state.user.credit,
    missedCount: missed,
    message: statusMessage(response.status, flags, missed)
  };
}

function resultFromResponse(state, response) {
  const survey = findSurvey(state, response.surveyId);
  const fallbackSurvey = survey || { questions: [] };
  return buildSubmitResult(state, response, fallbackSurvey, 0);
}

function settleAttemptExpired(state, attempt, survey) {
  attempt.status = 'expired';
  attempt.submittedAt = Date.now();

  if (findResponse(state, attempt.surveyId, attempt.userId)) return;

  const now = Date.now();
  const response = {
    id: uid('resp'),
    surveyId: attempt.surveyId,
    userId: attempt.userId,
    attemptId: attempt.id,
    answers: {},
    flags: [],
    status: 'expired',
    createdAt: now,
    submittedAt: now
  };
  state.responses.push(response);

  if (attempt.userId === state.user.id) {
    const title = survey ? survey.title : '问卷';
    addCredit(state, -constants.EXPIRED_CREDIT_PENALTY, '逾期未作答：《' + title + '》', attempt.surveyId);
  }
}

/**
 * 惰性结算逾期 attempt：每次请求前执行一次，每条 attempt 只扣一次。
 */
function settleExpired(state) {
  const now = Date.now();
  state.attempts.forEach(function (attempt) {
    if (attempt.status !== 'in_progress') return;
    if (attempt.endAt > now) return;
    if (findResponse(state, attempt.surveyId, attempt.userId)) {
      attempt.status = 'expired';
      return;
    }
    settleAttemptExpired(state, attempt, findSurvey(state, attempt.surveyId));
  });
}

function submitSurvey(state, surveyId, data) {
  const survey = findSurvey(state, surveyId);
  if (!survey) {
    throw apiError('SURVEY_NOT_FOUND');
  }
  if (survey.ownerId === state.user.id) {
    throw apiError('SELF_ANSWER_FORBIDDEN');
  }

  const payload = data || {};
  const requestId = String(payload.requestId || '');
  if (requestId && state.requests[requestId]) {
    return state.requests[requestId];
  }

  const existing = findResponse(state, surveyId, state.user.id);
  if (existing) {
    const result = resultFromResponse(state, existing);
    if (requestId) state.requests[requestId] = result;
    return result;
  }

  const attempt = findAttempt(state, payload.attemptId, surveyId, state.user.id);
  if (!attempt || attempt.status !== 'in_progress') {
    throw apiError('ATTEMPT_EXPIRED', '作答记录已失效，请重新进入问卷');
  }

  if (Date.now() > attempt.endAt) {
    settleAttemptExpired(state, attempt, survey);
    throw apiError('ATTEMPT_EXPIRED', '问卷已截止，本次作答无效');
  }

  const normalized = normalizeAnswers(survey, payload.answers);
  const quality = evaluateQuality(survey, normalized.answers, attempt, Date.now());

  const now = Date.now();
  const response = {
    id: uid('resp'),
    surveyId: survey.id,
    userId: state.user.id,
    attemptId: attempt.id,
    answers: normalized.answers,
    flags: quality.flags,
    status: quality.status,
    createdAt: now,
    submittedAt: now
  };
  state.responses.push(response);

  attempt.status = quality.status;
  attempt.submittedAt = now;

  if (quality.status === 'valid') {
    addPoints(state, constants.REWARD_POINTS, '有效完成问卷：《' + survey.title + '》', survey.id);
    addCredit(state, constants.REWARD_CREDIT, '有效完成问卷：《' + survey.title + '》', survey.id);
  } else if (quality.status === 'incomplete') {
    addCredit(
      state,
      -constants.INCOMPLETE_CREDIT_PENALTY,
      '未答完：《' + survey.title + '》',
      survey.id
    );
  }

  const result = buildSubmitResult(state, response, survey, quality.missedCount);
  if (requestId) state.requests[requestId] = result;
  return result;
}

function toPublicResponse(state, response) {
  const survey = findSurvey(state, response.surveyId);
  const flags = response.flags || [];
  const answers = response.answers || {};
  const status = response.status;
  let pointsEarned = 0;
  let creditDelta = 0;
  if (status === 'valid') {
    pointsEarned = constants.REWARD_POINTS;
    creditDelta = constants.REWARD_CREDIT;
  } else if (status === 'incomplete') {
    creditDelta = -constants.INCOMPLETE_CREDIT_PENALTY;
  } else if (status === 'expired') {
    creditDelta = -constants.EXPIRED_CREDIT_PENALTY;
  }

  return {
    id: response.id,
    surveyId: response.surveyId,
    surveyTitle: survey ? survey.title : '问卷已删除',
    surveyExists: !!survey,
    status: status,
    statusText: constants.RESPONSE_STATUS_TEXT[status] || status,
    flags: flags,
    flagLabels: flagLabels(flags),
    answers: answers,
    hasAnswers: status !== 'expired' && Object.keys(answers).length > 0,
    pointsEarned: pointsEarned,
    creditDelta: creditDelta,
    createdAt: response.createdAt,
    submittedAt: response.submittedAt || response.createdAt
  };
}

function getMySurveys(state) {
  const now = Date.now();
  return state.surveys
    .filter(function (survey) {
      return survey.ownerId === state.user.id;
    })
    .sort(function (a, b) {
      return b.createdAt - a.createdAt;
    })
    .map(function (survey) {
      const responses = state.responses.filter(function (item) {
        return String(item.surveyId) === String(survey.id);
      });
      const validCount = responses.filter(function (item) {
        return item.status === 'valid';
      }).length;
      const invalidCount = responses.filter(function (item) {
        return item.status === 'invalid';
      }).length;
      const incompleteCount = responses.filter(function (item) {
        return item.status === 'incomplete';
      }).length;
      const expiredCount = responses.filter(function (item) {
        return item.status === 'expired';
      }).length;
      const status = effectiveStatus(survey, now);
      return {
        id: survey.id,
        title: survey.title,
        category: survey.category,
        status: status,
        statusText: status === 'open' ? '进行中' : '已截止',
        questionCount: survey.questions.length,
        startAt: survey.startAt,
        endAt: survey.endAt,
        createdAt: survey.createdAt,
        responseCount: validCount + invalidCount + incompleteCount,
        validCount: validCount,
        invalidCount: invalidCount,
        incompleteCount: incompleteCount,
        expiredCount: expiredCount
      };
    });
}

function getMyResponses(state) {
  return state.responses
    .filter(function (response) {
      return response.userId === state.user.id;
    })
    .sort(function (a, b) {
      return b.createdAt - a.createdAt;
    })
    .map(function (response) {
      return toPublicResponse(state, response);
    });
}

function getLedger(state, type) {
  const list = type === 'credit' ? state.creditLedger : state.pointLedger;
  return list.slice(0, constants.LOG_MAX).map(function (entry) {
    return {
      id: entry.id,
      delta: entry.delta,
      reason: entry.reason,
      surveyId: entry.surveyId,
      balanceAfter: entry.balanceAfter,
      createdAt: entry.createdAt,
      type: type === 'credit' ? 'credit' : 'points'
    };
  });
}

function parseQuery(queryString) {
  const result = {};
  if (!queryString) return result;
  queryString.split('&').forEach(function (pair) {
    if (!pair) return;
    const index = pair.indexOf('=');
    const key = decodeURIComponent(index >= 0 ? pair.slice(0, index) : pair);
    const value = index >= 0 ? decodeURIComponent(pair.slice(index + 1)) : '';
    result[key] = value;
  });
  return result;
}

function route(state, options) {
  const url = options.url || '';
  const queryIndex = url.indexOf('?');
  const path = queryIndex >= 0 ? url.slice(0, queryIndex) : url;
  const query = parseQuery(queryIndex >= 0 ? url.slice(queryIndex + 1) : '');
  const segments = path.split('/').filter(Boolean);
  const method = (options.method || 'GET').toUpperCase();
  const data = options.data || {};

  if (segments[0] === 'auth') {
    if (method === 'POST' && path === '/auth/login') {
      return login(state);
    }
    if (method === 'POST' && path === '/auth/bind') {
      return bind(state, data);
    }
    throw apiError('NOT_FOUND');
  }

  // 已登录未绑定学号也允许读取自己的状态（PRD 3.2：可浏览，不能发布/作答/领取）
  if (method === 'GET' && path === '/me') {
    return publicUser(state);
  }

  requireBound(state);

  if (method === 'PATCH' && path === '/me') {
    return updateNickname(state, data);
  }
  if (method === 'POST' && path === '/me/onboard') {
    return onboard(state);
  }
  if (method === 'GET' && path === '/me/ledger') {
    return getLedger(state, query.type === 'credit' ? 'credit' : 'points');
  }
  if (method === 'GET' && path === '/me/surveys') {
    return getMySurveys(state);
  }
  if (method === 'GET' && path === '/me/responses') {
    return getMyResponses(state);
  }

  if (method === 'GET' && path === '/surveys') {
    return listSurveys(state);
  }
  if (method === 'POST' && path === '/surveys') {
    return createSurvey(state, data);
  }

  if (segments[0] === 'surveys' && segments.length >= 2) {
    const surveyId = decodeURIComponent(segments[1]);
    if (method === 'GET' && segments.length === 2) {
      return getSurveyDetail(state, surveyId);
    }
    if (method === 'POST' && segments.length === 3 && segments[2] === 'start') {
      return startSurvey(state, surveyId);
    }
    if (method === 'POST' && segments.length === 3 && segments[2] === 'submit') {
      return submitSurvey(state, surveyId, data);
    }
  }

  throw apiError('NOT_FOUND');
}

/**
 * 所有 Mock 接口都经过这里，页面只调用 services/api.js。
 */
function request(options) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      const state = loadState();
      settleExpired(state);
      try {
        const result = route(state, options || {});
        saveState(state);
        resolve(result);
      } catch (err) {
        saveState(state);
        reject(err);
      }
    }, LATENCY_MS);
  });
}

module.exports = {
  request: request,
  reset: reset
};
