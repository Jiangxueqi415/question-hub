/* 问卷互助 · 唯一数据层
 * 唯一入口：window.SurveyStore
 * 页面只通过这里读写业务数据，不直接操作 localStorage 里的 points / claimed / surveys。
 */
(function () {
  'use strict';

  var KEYS = { POINTS: 'points', CLAIMED: 'claimed', SURVEYS: 'surveys' };
  var INITIAL_POINTS = 50;
  var PUBLISH_COST = 10;
  var REWARD = 5;
  var CATEGORIES = ['学习', '生活', '调研', '其他'];
  var DEFAULT_MINUTES = 3;
  var DEFAULT_PUBLISHER = '我';
  var TITLE_MAX = 40;
  var QUESTION_TEXT_MAX = 100;
  var OPTION_MAX = 50;
  var QUESTIONS_MIN = 1;
  var QUESTIONS_MAX = 10;
  var OPTIONS_MIN = 2;
  var OPTIONS_MAX = 6;
  var MINUTES_MIN = 1;
  var MINUTES_MAX = 60;
  var COVER_MAX_LENGTH = 450000;

  var MSG_STORAGE_ERROR = '本地存储不可用，问卷没有保存，请检查浏览器设置';

  var BUILTIN_SURVEYS = [
    {
      id: '1',
      title: '大学生网购消费习惯调查',
      publisher: '张三',
      category: '生活',
      minutes: 3,
      reward: REWARD,
      createdAt: 1731052800000,
      mine: false,
      locked: true,
      questions: [
        {
          q: '你平均每月网购几次？',
          type: 'single',
          options: ['1 次以下', '1-3 次', '4-6 次', '7 次以上'],
          answer: [1]
        },
        {
          q: '你常用的网购平台有哪些？',
          type: 'multiple',
          options: ['淘宝', '京东', '拼多多', '抖音电商'],
          answer: [0, 1]
        },
        {
          q: '你网购时最关注的因素是？',
          type: 'single',
          options: ['价格', '质量', '物流速度', '买家评价'],
          answer: [0]
        },
        {
          q: '你每月网购的花费大约是？',
          type: 'single',
          options: ['100 元以内', '100-300 元', '300-500 元', '500 元以上'],
          answer: [1]
        }
      ]
    },
    {
      id: '2',
      title: '关于校园食堂满意度的调研',
      publisher: '李四',
      category: '调研',
      minutes: 2,
      reward: REWARD,
      createdAt: 1731052800001,
      mine: false,
      locked: true,
      questions: [
        {
          q: '你每周在校园食堂就餐几次？',
          type: 'single',
          options: ['1-3 次', '4-6 次', '7-10 次', '10 次以上'],
          answer: [1]
        },
        {
          q: '你对食堂整体的满意度如何？',
          type: 'single',
          options: ['非常满意', '比较满意', '一般', '不满意'],
          answer: [1]
        },
        {
          q: '你认为食堂需要在哪些方面改进？',
          type: 'multiple',
          options: ['菜品口味', '菜品价格', '就餐环境', '排队速度'],
          answer: [0, 1, 3]
        },
        {
          q: '你一般会去哪个食堂就餐？',
          type: 'single',
          options: ['一食堂', '二食堂', '三食堂', '其他'],
          answer: [0]
        }
      ]
    }
  ];

  /* ---------- 本地存储（任何异常都静默降级） ---------- */

  function safeGetItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function safeSetItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      return false;
    }
  }

  function safeRemoveItem(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      /* 存储不可用时无需处理 */
    }
  }

  function initStorageDefaults() {
    if (safeGetItem(KEYS.POINTS) === null) {
      safeSetItem(KEYS.POINTS, String(INITIAL_POINTS));
    }
    if (safeGetItem(KEYS.CLAIMED) === null) {
      safeSetItem(KEYS.CLAIMED, '[]');
    }
    if (safeGetItem(KEYS.SURVEYS) === null) {
      safeSetItem(KEYS.SURVEYS, '[]');
    }
  }

  function readPoints() {
    var raw = safeGetItem(KEYS.POINTS);
    if (raw === null) return INITIAL_POINTS;
    var value = parseInt(raw, 10);
    return isFinite(value) && value >= 0 ? value : INITIAL_POINTS;
  }

  function readClaimed() {
    var raw = null;
    var value;
    try {
      raw = JSON.parse(safeGetItem(KEYS.CLAIMED) || '[]');
    } catch (err) {
      return [];
    }
    if (!Array.isArray(raw)) return [];
    var claimed = [];
    for (var i = 0; i < raw.length; i++) {
      if (typeof raw[i] === 'string' && claimed.indexOf(raw[i]) === -1) {
        claimed.push(raw[i]);
      }
    }
    return claimed;
  }

  function readRawSurveys() {
    var parsed;
    try {
      parsed = JSON.parse(safeGetItem(KEYS.SURVEYS) || '[]');
    } catch (err) {
      return [];
    }
    return Array.isArray(parsed) ? parsed : [];
  }

  /* ---------- 校验 ---------- */

  function validateTitle(raw) {
    var title = typeof raw === 'string' ? raw.trim() : '';
    if (!title) return { ok: false, error: '请填写问卷标题' };
    if (title.length > TITLE_MAX) return { ok: false, error: '标题最多 ' + TITLE_MAX + ' 个字' };
    return { ok: true, value: title };
  }

  function parseAnswerList(raw, optionCount, type, no) {
    var parts;
    if (raw === undefined || raw === null || raw === '') return { ok: true, value: [] };

    if (Array.isArray(raw)) {
      parts = raw.slice();
    } else if (typeof raw === 'string') {
      parts = raw.split(/[,\uFF0C\u3001\s]+/).filter(function (part) {
        return part !== '';
      });
    } else {
      return { ok: false, error: '第 ' + no + ' 题的正确答案格式不正确，请填写选项字母（如 A）' };
    }

    if (parts.length === 0) return { ok: true, value: [] };

    var answer = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      var index = -1;

      if (typeof part === 'number') {
        index = part;
      } else if (typeof part === 'string') {
        var token = part.trim();
        if (/^[A-Fa-f]$/.test(token)) {
          index = token.toUpperCase().charCodeAt(0) - 65;
        } else if (/^\d+$/.test(token)) {
          index = parseInt(token, 10) - 1;
        } else {
          return { ok: false, error: '第 ' + no + ' 题的正确答案格式不正确，请填写选项字母（如 A）' };
        }
      } else {
        return { ok: false, error: '第 ' + no + ' 题的正确答案格式不正确，请填写选项字母（如 A）' };
      }

      if (!isFinite(index) || Math.floor(index) !== index || index < 0 || index >= optionCount) {
        return { ok: false, error: '第 ' + no + ' 题的正确答案超出选项范围' };
      }
      if (answer.indexOf(index) === -1) answer.push(index);
    }

    if (type !== 'multiple' && answer.length > 1) {
      return { ok: false, error: '第 ' + no + ' 题是单选题，只能设置 1 个正确答案' };
    }

    return { ok: true, value: answer };
  }

  function validateQuestions(rawQuestions) {
    if (!Array.isArray(rawQuestions) || rawQuestions.length < QUESTIONS_MIN) {
      return { ok: false, error: '至少需要 ' + QUESTIONS_MIN + ' 道题目' };
    }
    if (rawQuestions.length > QUESTIONS_MAX) {
      return { ok: false, error: '最多支持 ' + QUESTIONS_MAX + ' 道题' };
    }

    var cleaned = [];
    for (var i = 0; i < rawQuestions.length; i++) {
      var raw = rawQuestions[i];
      var no = i + 1;
      if (!raw || typeof raw !== 'object') {
        return { ok: false, error: '第 ' + no + ' 题的题目不能为空' };
      }

      var questionText = typeof raw.q === 'string' ? raw.q.trim() : '';
      if (!questionText) {
        return { ok: false, error: '第 ' + no + ' 题的题目不能为空' };
      }
      if (questionText.length > QUESTION_TEXT_MAX) {
        return { ok: false, error: '第 ' + no + ' 题的题目最多 ' + QUESTION_TEXT_MAX + ' 个字' };
      }

      if (!Array.isArray(raw.options) || raw.options.length < OPTIONS_MIN) {
        return { ok: false, error: '第 ' + no + ' 题至少需要 ' + OPTIONS_MIN + ' 个选项' };
      }
      if (raw.options.length > OPTIONS_MAX) {
        return { ok: false, error: '第 ' + no + ' 题最多支持 ' + OPTIONS_MAX + ' 个选项' };
      }

      var options = [];
      var seen = {};
      for (var j = 0; j < raw.options.length; j++) {
        var option = typeof raw.options[j] === 'string' ? raw.options[j].trim() : '';
        if (!option) {
          return { ok: false, error: '第 ' + no + ' 题第 ' + (j + 1) + ' 个选项不能为空' };
        }
        if (option.length > OPTION_MAX) {
          return { ok: false, error: '第 ' + no + ' 题的选项最多 ' + OPTION_MAX + ' 个字' };
        }
        if (seen[option]) {
          return { ok: false, error: '第 ' + no + ' 题的选项不能重复' };
        }
        seen[option] = true;
        options.push(option);
      }

      var type = raw.type === 'multiple' ? 'multiple' : 'single';
      var answerResult = parseAnswerList(raw.answer, options.length, type, no);
      if (!answerResult.ok) return answerResult;

      cleaned.push({
        q: questionText,
        type: type,
        options: options,
        answer: answerResult.value
      });
    }

    return { ok: true, value: cleaned };
  }

  function normalizePublisher(raw) {
    var publisher = typeof raw === 'string' ? raw.trim() : '';
    return publisher ? publisher.slice(0, 20) : DEFAULT_PUBLISHER;
  }

  function normalizeCategory(raw) {
    return CATEGORIES.indexOf(raw) !== -1 ? raw : '其他';
  }

  function normalizeMinutes(raw) {
    var minutes = parseInt(raw, 10);
    if (!isFinite(minutes)) minutes = DEFAULT_MINUTES;
    if (minutes < MINUTES_MIN) minutes = MINUTES_MIN;
    if (minutes > MINUTES_MAX) minutes = MINUTES_MAX;
    return minutes;
  }

  function normalizeCover(raw) {
    if (typeof raw !== 'string') return '';
    if (raw.length > COVER_MAX_LENGTH) return '';
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(raw)) return '';
    return raw;
  }

  /* ---------- 读取与清洗 ---------- */

  function normalizeStoredSurvey(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.id !== 'string' || raw.id.indexOf('u') !== 0) return null;

    var titleResult = validateTitle(raw.title);
    if (!titleResult.ok) return null;

    var questionsResult = validateQuestions(raw.questions);
    if (!questionsResult.ok) return null;

    var createdAt = typeof raw.createdAt === 'number' && isFinite(raw.createdAt) ? raw.createdAt : 0;

    return {
      id: raw.id,
      title: titleResult.value,
      publisher: normalizePublisher(raw.publisher),
      category: normalizeCategory(raw.category),
      minutes: normalizeMinutes(raw.minutes),
      reward: REWARD,
      createdAt: createdAt,
      mine: true,
      locked: true,
      cover: normalizeCover(raw.cover),
      questions: questionsResult.value
    };
  }

  function readUserSurveys() {
    var rawList = readRawSurveys();
    var surveys = [];
    var seen = {};
    for (var i = 0; i < rawList.length; i++) {
      var survey = normalizeStoredSurvey(rawList[i]);
      if (survey && !seen[survey.id]) {
        seen[survey.id] = true;
        surveys.push(survey);
      }
    }
    surveys.sort(function (a, b) {
      return b.createdAt - a.createdAt;
    });
    return surveys;
  }

  function isClaimed(id) {
    return readClaimed().indexOf(id) !== -1;
  }

  /* ---------- 对外数据接口 ---------- */

  function fail(error, code) {
    var result = { ok: false, error: error };
    if (code) result.code = code;
    return result;
  }

  function get(id) {
    if (typeof id !== 'string' || !id) return null;
    var userSurveys = readUserSurveys();
    for (var i = 0; i < userSurveys.length; i++) {
      if (userSurveys[i].id === id) return userSurveys[i];
    }
    for (var j = 0; j < BUILTIN_SURVEYS.length; j++) {
      if (BUILTIN_SURVEYS[j].id === id) return BUILTIN_SURVEYS[j];
    }
    return null;
  }

  function list() {
    return readUserSurveys().concat(BUILTIN_SURVEYS);
  }

  function mine() {
    return readUserSurveys();
  }

  function history() {
    var claimed = readClaimed();
    var result = [];
    for (var i = 0; i < claimed.length; i++) {
      var survey = get(claimed[i]);
      result.push({
        id: claimed[i],
        title: survey ? survey.title : '',
        reward: survey ? survey.reward : REWARD,
        exists: !!survey
      });
    }
    return result;
  }

  function makeId(existing) {
    var id;
    do {
      id = 'u' + Date.now() + Math.random().toString(36).slice(2, 5);
    } while (existing.indexOf(id) !== -1);
    return id;
  }

  function create(payload) {
    payload = payload && typeof payload === 'object' ? payload : {};

    var titleResult = validateTitle(payload.title);
    if (!titleResult.ok) return fail(titleResult.error);

    var questionsResult = validateQuestions(payload.questions);
    if (!questionsResult.ok) return fail(questionsResult.error);

    var points = readPoints();
    if (points < PUBLISH_COST) {
      return fail(
        '积分不足，发布需要 ' + PUBLISH_COST + ' 分，当前只有 ' + points + ' 分',
        'POINTS_NOT_ENOUGH'
      );
    }

    var userSurveys = readUserSurveys();
    var existingIds = userSurveys.map(function (survey) {
      return survey.id;
    });
    var survey = {
      id: makeId(existingIds),
      title: titleResult.value,
      publisher: normalizePublisher(payload.publisher),
      category: normalizeCategory(payload.category),
      minutes: normalizeMinutes(payload.minutes),
      reward: REWARD,
      createdAt: Date.now(),
      mine: true,
      locked: true,
      cover: normalizeCover(payload.cover),
      questions: questionsResult.value
    };

    var previousSurveysRaw = safeGetItem(KEYS.SURVEYS);
    var nextSurveysRaw = JSON.stringify([survey].concat(userSurveys));

    if (!safeSetItem(KEYS.SURVEYS, nextSurveysRaw)) {
      return fail(MSG_STORAGE_ERROR, 'STORAGE_ERROR');
    }

    var nextPoints = points - PUBLISH_COST;
    if (!safeSetItem(KEYS.POINTS, String(nextPoints))) {
      if (previousSurveysRaw === null) {
        safeRemoveItem(KEYS.SURVEYS);
      } else {
        safeSetItem(KEYS.SURVEYS, previousSurveysRaw);
      }
      return fail(MSG_STORAGE_ERROR, 'STORAGE_ERROR');
    }

    refreshUI();
    return { ok: true, id: survey.id, points: nextPoints };
  }

  function update(id, payload) {
    payload = payload && typeof payload === 'object' ? payload : {};
    var userSurveys = readUserSurveys();
    var targetIndex = -1;
    for (var i = 0; i < userSurveys.length; i++) {
      if (userSurveys[i].id === id) {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex === -1) return fail('问卷不存在', 'NOT_FOUND');

    var titleResult = validateTitle(payload.title);
    if (!titleResult.ok) return fail(titleResult.error);

    var questionsResult = validateQuestions(payload.questions);
    if (!questionsResult.ok) return fail(questionsResult.error);

    var original = userSurveys[targetIndex];
    var updated = {
      id: original.id,
      title: titleResult.value,
      publisher: payload.publisher !== undefined ? normalizePublisher(payload.publisher) : original.publisher,
      category: payload.category !== undefined ? normalizeCategory(payload.category) : original.category,
      minutes: payload.minutes !== undefined ? normalizeMinutes(payload.minutes) : original.minutes,
      reward: REWARD,
      createdAt: original.createdAt,
      mine: true,
      locked: true,
      cover: payload.cover !== undefined ? normalizeCover(payload.cover) : original.cover,
      questions: questionsResult.value
    };

    userSurveys[targetIndex] = updated;
    if (!safeSetItem(KEYS.SURVEYS, JSON.stringify(userSurveys))) {
      return fail(MSG_STORAGE_ERROR, 'STORAGE_ERROR');
    }

    refreshUI();
    return { ok: true, id: id, survey: updated, points: readPoints() };
  }

  function remove(id) {
    if (typeof id !== 'string') return false;
    var userSurveys = readUserSurveys();
    var remaining = [];
    var found = false;
    for (var i = 0; i < userSurveys.length; i++) {
      if (userSurveys[i].id === id) {
        found = true;
      } else {
        remaining.push(userSurveys[i]);
      }
    }
    if (!found) return false;
    if (!safeSetItem(KEYS.SURVEYS, JSON.stringify(remaining))) return false;
    refreshUI();
    return true;
  }

  function claimPoints(id) {
    var survey = get(id);
    if (!survey) return false;
    if (survey.mine) return false;

    var claimed = readClaimed();
    if (claimed.indexOf(survey.id) !== -1) return false;

    var nextClaimed = claimed.concat([survey.id]);
    var previousClaimedRaw = safeGetItem(KEYS.CLAIMED);
    if (!safeSetItem(KEYS.CLAIMED, JSON.stringify(nextClaimed))) return false;

    var nextPoints = readPoints() + REWARD;
    if (!safeSetItem(KEYS.POINTS, String(nextPoints))) {
      if (previousClaimedRaw === null) {
        safeRemoveItem(KEYS.CLAIMED);
      } else {
        safeSetItem(KEYS.CLAIMED, previousClaimedRaw);
      }
      return false;
    }

    refreshUI();
    return nextPoints;
  }

  function reset() {
    var ok = safeSetItem(KEYS.POINTS, String(INITIAL_POINTS));
    ok = safeSetItem(KEYS.CLAIMED, '[]') && ok;
    ok = safeSetItem(KEYS.SURVEYS, '[]') && ok;
    refreshUI();
    return ok;
  }

  /* ---------- 页面渲染与同步（app.js 统一负责） ---------- */

  function syncPoints() {
    var points = readPoints();
    var nodes = document.querySelectorAll('#top-points, #profile-points, [data-points]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = String(points);
    }
  }

  function renderHome() {
    var container = document.getElementById('question-list');
    if (!container) return;

    var surveys = list();
    container.textContent = '';

    if (!surveys.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      var emptyTitle = document.createElement('p');
      emptyTitle.className = 'empty-state__title';
      emptyTitle.textContent = '还没有问卷';
      var emptyLink = document.createElement('a');
      emptyLink.className = 'btn btn-primary';
      emptyLink.href = 'publish.html';
      emptyLink.textContent = '去发布第一份问卷';
      empty.appendChild(emptyTitle);
      empty.appendChild(emptyLink);
      container.appendChild(empty);
      return;
    }

    for (var i = 0; i < surveys.length; i++) {
      var survey = surveys[i];
      var card = document.createElement('article');
      card.className = 'survey-card';

      var titleRow = document.createElement('div');
      titleRow.className = 'survey-card__title-row';

      var heading = document.createElement('h2');
      heading.className = 'survey-card__title';
      var titleLink = document.createElement('a');
      titleLink.href = 'detail.html?id=' + encodeURIComponent(survey.id);
      titleLink.textContent = survey.title;
      heading.appendChild(titleLink);
      titleRow.appendChild(heading);

      if (survey.mine) {
        var badge = document.createElement('span');
        badge.className = 'mine-badge';
        badge.textContent = '我发布的';
        titleRow.appendChild(badge);
      }

      var meta = document.createElement('p');
      meta.className = 'survey-card__meta';
      meta.textContent =
        '发布者: ' + survey.publisher +
        ' | 预计耗时: ' + survey.minutes + '分钟' +
        ' | 共 ' + survey.questions.length + ' 题';

      var action = document.createElement('div');
      action.className = 'survey-card__action';
      var detailHref = 'detail.html?id=' + encodeURIComponent(survey.id);

      if (survey.mine) {
        var mineLink = document.createElement('a');
        mineLink.className = 'btn btn-outline-primary survey-cta';
        mineLink.href = detailHref;
        mineLink.textContent = '查看详情';
        action.appendChild(mineLink);
      } else if (isClaimed(survey.id)) {
        var claimedButton = document.createElement('span');
        claimedButton.className = 'btn btn-secondary survey-cta disabled';
        claimedButton.setAttribute('aria-disabled', 'true');
        claimedButton.textContent = '已完成填写';
        action.appendChild(claimedButton);
      } else {
        var fillLink = document.createElement('a');
        fillLink.className = 'btn btn-outline-primary survey-cta';
        fillLink.href = detailHref;
        fillLink.textContent = '去填写（赚 ' + survey.reward + ' 积分）';
        action.appendChild(fillLink);
      }

      card.appendChild(titleRow);
      card.appendChild(meta);
      card.appendChild(action);
      container.appendChild(card);
    }
  }

  function emitChange() {
    document.dispatchEvent(new CustomEvent('surveystore:change'));
  }

  function refreshUI() {
    syncPoints();
    renderHome();
    emitChange();
  }

  function bindResetDemo() {
    var button = document.getElementById('reset-demo');
    if (!button) return;
    button.addEventListener('click', function () {
      var confirmed = window.confirm('确定重置演示吗？当前积分、发布记录和填写记录都会清空。');
      if (!confirmed) return;
      reset();
      window.location.href = 'index.html';
    });
  }

  function init() {
    initStorageDefaults();
    bindResetDemo();
    syncPoints();
    renderHome();

    window.addEventListener('storage', function (event) {
      if (!event.key ||
          event.key === KEYS.POINTS ||
          event.key === KEYS.CLAIMED ||
          event.key === KEYS.SURVEYS) {
        refreshUI();
      }
    });

    window.addEventListener('pageshow', function () {
      refreshUI();
    });
  }

  var api = {
    categories: Object.freeze(CATEGORIES.slice()),
    reward: REWARD,
    publishCost: PUBLISH_COST,
    limits: Object.freeze({
      titleMax: TITLE_MAX,
      titleInputMax: 20,
      questionTextMax: QUESTION_TEXT_MAX,
      optionMax: OPTION_MAX,
      questionsMin: QUESTIONS_MIN,
      questionsMax: QUESTIONS_MAX,
      optionsMin: OPTIONS_MIN,
      optionsMax: OPTIONS_MAX,
      minutesMin: MINUTES_MIN,
      minutesMax: MINUTES_MAX
    }),
    create: create,
    update: update,
    remove: remove,
    get: get,
    list: list,
    mine: mine,
    history: history,
    claimPoints: claimPoints,
    isClaimed: isClaimed,
    reset: reset
  };

  Object.defineProperty(api, 'points', {
    get: readPoints,
    enumerable: true
  });

  Object.defineProperty(api, 'currentUser', {
    get: function () {
      var userSurveys = readUserSurveys();
      return userSurveys.length ? userSurveys[0].publisher : DEFAULT_PUBLISHER;
    },
    enumerable: true
  });

  window.SurveyStore = api;
  init();
})();
