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
const mockData = require('../mock/mock.js');

const STORE_KEY = 'qh_mock_state_v1';
const STATE_VERSION = 2;
const MOCK_TOKEN = 'mock-token';
const LATENCY_MS = 120;
const LOG_KEEP = 120;

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
    surveys: mockData.createMockSurveys(now),
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
    throw apiError('STUDENT_NOT_BOUND', '请先在“我的”绑定学号');
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

function hasSeedStats(survey) {
  return !!(survey && survey.seedStats && Object.keys(survey.seedStats).length);
}

function countSurveyResponses(state, surveyId) {
  return state.responses.filter(function (response) {
    return String(response.surveyId) === String(surveyId) && response.status !== 'expired';
  }).length;
}

function hasAnyResponse(state, surveyId) {
  return countSurveyResponses(state, surveyId) > 0;
}

function participantCountOf(state, survey) {
  return (Number(survey.participantCount) || 0) + countSurveyResponses(state, survey.id);
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
  syncOwnedSurveyOwnerName(state);
  return {
    token: MOCK_TOKEN,
    user: publicUser(state),
    needBind: false
  };
}

function syncOwnedSurveyOwnerName(state) {
  state.surveys.forEach(function (survey) {
    if (survey.ownerId === state.user.id) {
      survey.ownerName = state.user.nickname;
    }
  });
}

function updateNickname(state, data) {
  const checked = validation.validateNickname(data && data.nickname);
  if (!checked.ok) {
    throw apiError('INVALID_PARAMS', checked.message);
  }
  state.user.nickname = checked.value;
  syncOwnedSurveyOwnerName(state);
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
        description: survey.description || '',
        ownerName: survey.ownerName,
        category: survey.category,
        minutes: survey.minutes,
        questionCount: survey.questions.length,
        participantCount: participantCountOf(state, survey),
        reward: constants.REWARD_POINTS,
        startAt: survey.startAt,
        endAt: survey.endAt,
        createdAt: survey.createdAt,
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
  const mine = survey.ownerId === state.user.id;
  return {
    id: survey.id,
    title: survey.title,
    description: survey.description || '',
    ownerId: survey.ownerId,
    ownerName: survey.ownerName,
    category: survey.category,
    minutes: survey.minutes,
    reward: constants.REWARD_POINTS,
    startAt: survey.startAt,
    endAt: survey.endAt,
    createdAt: survey.createdAt,
    participantCount: participantCountOf(state, survey),
    responseCount: countSurveyResponses(state, survey.id),
    hasResponses: mine ? hasAnyResponse(state, survey.id) || hasSeedStats(survey) : false,
    status: effectiveStatus(survey, Date.now()),
    mine: mine,
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

function buildQuestionObjects(rawQuestions, now) {
  return (rawQuestions || []).map(function (question, qIndex) {
    const stamp = now.toString(36) + '_' + Math.random().toString(36).slice(2, 5) + '_' + qIndex;
    return {
      id: 'q_' + stamp,
      type: question.type,
      title: question.title,
      sort: qIndex,
      options: (question.options || []).map(function (text, oIndex) {
        return {
          id: 'o_' + stamp + '_' + oIndex,
          text: text,
          sort: oIndex
        };
      })
    };
  });
}

function questionSignature(questions) {
  return (questions || [])
    .map(function (question) {
      const options = (question.options || [])
        .map(function (option) {
          return typeof option === 'string' ? option : option.text;
        })
        .join('\u0001');
      return [question.type, question.title, options].join('\u0002');
    })
    .join('\u0003');
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
    description: checked.value.description || '',
    category: checked.value.category,
    minutes: checked.value.minutes,
    startAt: checked.value.startAt,
    endAt: checked.value.endAt,
    status: 'open',
    createdAt: now,
    participantCount: 0,
    seedStats: {},
    questions: buildQuestionObjects(checked.value.questions, now)
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

function updateSurvey(state, id, data) {
  const survey = findSurvey(state, id);
  if (!survey) {
    throw apiError('SURVEY_NOT_FOUND');
  }
  if (survey.ownerId !== state.user.id) {
    throw apiError('FORBIDDEN', '只能编辑自己发布的问卷');
  }

  const checked = validation.normalizeSurvey(data);
  if (!checked.ok) {
    throw apiError('INVALID_PARAMS', checked.message);
  }

  const hasResponses = hasAnyResponse(state, survey.id) || hasSeedStats(survey);
  if (hasResponses && questionSignature(survey.questions) !== questionSignature(checked.value.questions)) {
    throw apiError('SURVEY_HAS_RESPONSES', '该问卷已有作答，题目不可修改；可修改标题、简介和时间');
  }

  survey.title = checked.value.title;
  survey.description = checked.value.description || '';
  survey.category = checked.value.category;
  survey.minutes = checked.value.minutes;
  survey.startAt = checked.value.startAt;
  survey.endAt = checked.value.endAt;
  if (!hasResponses) {
    survey.questions = buildQuestionObjects(checked.value.questions, Date.now());
  }

  return {
    id: survey.id,
    survey: getSurveyDetail(state, survey.id),
    points: state.user.points,
    credit: state.user.credit
  };
}

function closeSurvey(state, id) {
  const survey = findSurvey(state, id);
  if (!survey) {
    throw apiError('SURVEY_NOT_FOUND');
  }
  if (survey.ownerId !== state.user.id) {
    throw apiError('FORBIDDEN', '只能下架自己发布的问卷');
  }
  survey.status = 'closed';
  return getSurveyDetail(state, survey.id);
}

function getSurveyStats(state, id) {
  const survey = findSurvey(state, id);
  if (!survey) {
    throw apiError('SURVEY_NOT_FOUND');
  }
  if (survey.ownerId !== state.user.id) {
    throw apiError('FORBIDDEN', '只能查看自己发布问卷的统计');
  }

  const responses = state.responses.filter(function (response) {
    return String(response.surveyId) === String(survey.id) && response.status !== 'expired';
  });

  const questions = survey.questions.map(function (question) {
    const base = (survey.seedStats && survey.seedStats[question.id]) || null;

    if (question.type === 'open') {
      const answers = base && base.answers ? base.answers.slice() : [];
      responses.forEach(function (response) {
        const value = response.answers && response.answers[question.id];
        if (typeof value === 'string' && value.trim()) {
          answers.push(value.trim());
        }
      });
      return {
        id: question.id,
        type: question.type,
        title: question.title,
        total: answers.length,
        selectionTotal: answers.length,
        options: [],
        answers: answers
      };
    }

    const counts = question.options.map(function (option, index) {
      return base && base.counts && Number(base.counts[index]) ? Number(base.counts[index]) : 0;
    });
    let total = base && Number(base.total) ? Number(base.total) : 0;

    responses.forEach(function (response) {
      const value = response.answers && response.answers[question.id];
      if (question.type === 'single' && Number.isInteger(value) && counts[value] != null) {
        counts[value] += 1;
        total += 1;
      } else if (question.type === 'multiple' && Array.isArray(value) && value.length) {
        value.forEach(function (index) {
          if (counts[index] != null) counts[index] += 1;
        });
        total += 1;
      }
    });

    const selectionTotal = counts.reduce(function (sum, count) {
      return sum + count;
    }, 0);

    return {
      id: question.id,
      type: question.type,
      title: question.title,
      total: total,
      selectionTotal: selectionTotal,
      options: question.options.map(function (option, index) {
        return {
          text: option.text,
          count: counts[index],
          percent: total ? Math.round((counts[index] / total) * 1000) / 10 : 0
        };
      }),
      answers: []
    };
  });

  const status = effectiveStatus(survey, Date.now());
  return {
    id: survey.id,
    title: survey.title,
    description: survey.description || '',
    status: status,
    statusText: status === 'open' ? '进行中' : '已截止',
    participantCount: (Number(survey.participantCount) || 0) + responses.length,
    responseCount: responses.length,
    hasResponses: responses.length > 0 || hasSeedStats(survey),
    questions: questions
  };
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
 * 质量核验（PRD 6.5 + 本轮补充规则）：
 * - 未答率 > 20%：incomplete
 * - 作答时间 <= 2 秒：直接判 invalid（不发积分/信誉）
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

  if (elapsedSeconds <= constants.QUALITY.FAST_INVALID_SECONDS) {
    return {
      status: 'invalid',
      flags: ['fast'],
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
    if (flags.indexOf('fast') !== -1) {
      return '未通过质量核验：作答时间过短。本次不计积分和信誉分，请认真作答。';
    }
    return '未通过质量核验：' + labels.join('、') + '。本次不计积分和信誉分。';
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
      const responseCount = validCount + invalidCount + incompleteCount;
      return {
        id: survey.id,
        title: survey.title,
        description: survey.description || '',
        category: survey.category,
        status: status,
        statusText: status === 'open' ? '进行中' : '已截止',
        questionCount: survey.questions.length,
        participantCount: (Number(survey.participantCount) || 0) + responseCount,
        startAt: survey.startAt,
        endAt: survey.endAt,
        createdAt: survey.createdAt,
        responseCount: responseCount,
        validCount: validCount,
        invalidCount: invalidCount,
        incompleteCount: incompleteCount,
        expiredCount: expiredCount,
        hasResponses: responseCount > 0 || hasSeedStats(survey)
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

  // 未绑定学号也可以浏览：/me、问卷列表与问卷详情
  if (method === 'GET' && path === '/me') {
    return publicUser(state);
  }
  if (method === 'GET' && path === '/me/ledger') {
    if (!state.user.bound) return [];
    return getLedger(state, query.type === 'credit' ? 'credit' : 'points');
  }
  if (method === 'GET' && path === '/me/surveys') {
    if (!state.user.bound) return [];
    return getMySurveys(state);
  }
  if (method === 'GET' && path === '/me/responses') {
    if (!state.user.bound) return [];
    return getMyResponses(state);
  }
  if (method === 'GET' && path === '/surveys') {
    return listSurveys(state);
  }
  if (segments[0] === 'surveys' && segments.length === 2 && method === 'GET') {
    return getSurveyDetail(state, decodeURIComponent(segments[1]));
  }

  // 以下操作需要先绑定学号
  requireBound(state);

  if (method === 'PATCH' && path === '/me') {
    return updateNickname(state, data);
  }
  if (method === 'POST' && path === '/me/onboard') {
    return onboard(state);
  }
  if (method === 'POST' && path === '/surveys') {
    return createSurvey(state, data);
  }

  if (segments[0] === 'surveys' && segments.length >= 2) {
    const surveyId = decodeURIComponent(segments[1]);
    if (method === 'GET' && segments.length === 3 && segments[2] === 'stats') {
      return getSurveyStats(state, surveyId);
    }
    if (method === 'PATCH' && segments.length === 2) {
      return updateSurvey(state, surveyId, data);
    }
    if (method === 'POST' && segments.length === 3 && segments[2] === 'start') {
      return startSurvey(state, surveyId);
    }
    if (method === 'POST' && segments.length === 3 && segments[2] === 'submit') {
      return submitSurvey(state, surveyId, data);
    }
    if (method === 'POST' && segments.length === 3 && segments[2] === 'close') {
      return closeSurvey(state, surveyId);
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
