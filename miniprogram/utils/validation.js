const constants = require('./constants');

function trim(value) {
  return String(value == null ? '' : value).trim();
}

/**
 * 绑定学号校验（PRD 6.1）
 */
function validateBind(data) {
  const studentNo = trim(data && data.studentNo);
  const nickname = trim(data && data.nickname);
  if (!constants.STUDENT_NO_PATTERN.test(studentNo)) {
    return { ok: false, message: '学号格式不正确，请输入 10–12 位数字' };
  }
  if (nickname.length < constants.NICKNAME_MIN_LEN || nickname.length > constants.NICKNAME_MAX_LEN) {
    return { ok: false, message: '昵称需为 2–20 个字' };
  }
  if (/[\u0000-\u001f\u007f]/.test(nickname)) {
    return { ok: false, message: '昵称包含非法字符' };
  }
  return { ok: true, value: { studentNo: studentNo, nickname: nickname } };
}

function validateNickname(nickname) {
  const value = trim(nickname);
  if (value.length < constants.NICKNAME_MIN_LEN || value.length > constants.NICKNAME_MAX_LEN) {
    return { ok: false, message: '昵称需为 2–20 个字' };
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return { ok: false, message: '昵称包含非法字符' };
  }
  return { ok: true, value: value };
}

/**
 * 发布问卷校验与清洗（PRD 6.4 / 协作约定第 5 节）
 * 空选项行会被忽略；清洗后选择题必须仍有 2–6 个不重复选项。
 */
function normalizeSurvey(input) {
  const data = input || {};
  const title = trim(data.title);
  if (title.length < constants.TITLE_MIN_LEN || title.length > constants.TITLE_MAX_LEN) {
    return { ok: false, message: '标题需为 2–40 个字' };
  }

  const category = trim(data.category);
  if (constants.CATEGORIES.indexOf(category) === -1) {
    return { ok: false, message: '请选择有效的分类' };
  }

  const description = trim(data.description);
  if (description.length > constants.DESCRIPTION_MAX_LEN) {
    return { ok: false, message: '问卷简介最多 ' + constants.DESCRIPTION_MAX_LEN + ' 个字' };
  }

  const minutes = parseInt(data.minutes, 10);
  if (isNaN(minutes) || minutes < constants.MINUTES_MIN || minutes > constants.MINUTES_MAX) {
    return { ok: false, message: '预计耗时需为 1–60 分钟' };
  }

  const startAt = Number(data.startAt);
  const endAt = Number(data.endAt);
  if (!startAt || !endAt) {
    return { ok: false, message: '请选择开始和截止时间' };
  }
  if (endAt <= startAt) {
    return { ok: false, message: '截止时间必须晚于开始时间' };
  }
  if (endAt <= Date.now()) {
    return { ok: false, message: '截止时间必须晚于当前时间' };
  }

  const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
  if (rawQuestions.length < constants.QUESTION_MIN) {
    return { ok: false, message: '至少需要 1 道题目' };
  }
  if (rawQuestions.length > constants.QUESTION_MAX) {
    return { ok: false, message: '最多支持 ' + constants.QUESTION_MAX + ' 道题' };
  }

  const questions = [];
  for (let i = 0; i < rawQuestions.length; i += 1) {
    const item = rawQuestions[i] || {};
    const qTitle = trim(item.title);
    if (!qTitle) {
      return { ok: false, message: '第 ' + (i + 1) + ' 题的题目不能为空' };
    }
    if (qTitle.length > constants.QUESTION_TITLE_MAX_LEN) {
      return { ok: false, message: '第 ' + (i + 1) + ' 题最多 ' + constants.QUESTION_TITLE_MAX_LEN + ' 个字' };
    }

    let type = trim(item.type);
    if (['single', 'multiple', 'open'].indexOf(type) === -1) {
      type = 'single';
    }

    if (type === 'open') {
      questions.push({ type: 'open', title: qTitle, options: [] });
      continue;
    }

    const rawOptions = Array.isArray(item.options) ? item.options : [];
    const clean = [];
    for (let j = 0; j < rawOptions.length; j += 1) {
      const option = trim(rawOptions[j]);
      if (!option) continue;
      if (option.length > constants.OPTION_MAX_LEN) {
        return {
          ok: false,
          message: '第 ' + (i + 1) + ' 题有选项超过 ' + constants.OPTION_MAX_LEN + ' 个字'
        };
      }
      if (clean.indexOf(option) !== -1) {
        return { ok: false, message: '第 ' + (i + 1) + ' 题有重复选项：' + option };
      }
      clean.push(option);
    }
    if (clean.length < constants.OPTION_MIN) {
      return { ok: false, message: '第 ' + (i + 1) + ' 题至少需要 2 个选项' };
    }
    if (clean.length > constants.OPTION_MAX) {
      return { ok: false, message: '第 ' + (i + 1) + ' 题最多 ' + constants.OPTION_MAX + ' 个选项' };
    }

    questions.push({ type: type, title: qTitle, options: clean });
  }

  return {
    ok: true,
    value: {
      title: title,
      description: description,
      category: category,
      minutes: minutes,
      startAt: startAt,
      endAt: endAt,
      questions: questions
    }
  };
}

module.exports = {
  trim: trim,
  validateBind: validateBind,
  validateNickname: validateNickname,
  normalizeSurvey: normalizeSurvey
};
