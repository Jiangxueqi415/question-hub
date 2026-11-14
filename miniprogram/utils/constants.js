/**
 * 业务常量与规则（对齐 PRD v1.0 第 6.6 / 6.5 / 6.4 节）
 *
 * 这些数值只用于前端展示与表单校验；
 * 真实环境下的计时、判重、结算、质量核验一律以服务端为准。
 */
module.exports = {
  // ---------- 积分 / 信誉 ----------
  INITIAL_POINTS: 0,
  INITIAL_CREDIT: 0,
  POINTS_MIN: 0,
  CREDIT_MIN: 0,
  CREDIT_MAX: 100,

  REWARD_POINTS: 5,
  REWARD_CREDIT: 5,

  PUBLISH_POINTS_COST: 10,
  PUBLISH_CREDIT_MIN: 40,

  ONBOARD_CREDIT: 40,
  ONBOARD_POINTS: 0,

  INCOMPLETE_CREDIT_PENALTY: 5,
  EXPIRED_CREDIT_PENALTY: 20,

  LOG_MAX: 60,

  // ---------- 等级 ----------
  CREDIT_LEVELS: [
    { min: 85, name: '优秀', tone: 'excellent' },
    { min: 70, name: '良好', tone: 'good' },
    { min: 40, name: '一般', tone: 'fair' },
    { min: 0, name: '较差', tone: 'poor' }
  ],

  // ---------- 问卷字段限制 ----------
  CATEGORIES: ['学习调研', '生活服务', '社团活动', '其他'],
  QUESTION_TYPES: [
    { value: 'single', label: '单选' },
    { value: 'multiple', label: '多选' },
    { value: 'open', label: '开放题' }
  ],

  TITLE_MIN_LEN: 2,
  TITLE_MAX_LEN: 40,
  DESCRIPTION_MAX_LEN: 200,
  QUESTION_MIN: 1,
  QUESTION_MAX: 25,
  QUESTION_TITLE_MAX_LEN: 100,
  OPTION_MIN: 2,
  OPTION_MAX: 6,
  OPTION_MAX_LEN: 50,
  MINUTES_MIN: 1,
  MINUTES_MAX: 60,
  OPEN_ANSWER_MAX_LEN: 100,

  NICKNAME_MIN_LEN: 2,
  NICKNAME_MAX_LEN: 20,
  STUDENT_NO_PATTERN: /^\d{10,12}$/,

  // ---------- 质量核验（PRD 6.5） ----------
  QUALITY: {
    FAST_INVALID_SECONDS: 2,
    MIN_SECONDS: 3,
    MISS_RATE: 0.2,
    STRAIGHT_RATE: 0.8,
    OPEN_MIN_CHARS: 4,
    OPEN_WHITELIST: ['无', '没有', '暂无']
  },

  // ---------- 文案 ----------
  RESPONSE_STATUS_TEXT: {
    in_progress: '作答中',
    valid: '已完成',
    invalid: '未通过质量核验',
    incomplete: '未答完',
    expired: '已过期'
  },

  FLAG_LABELS: {
    fast: '作答时长过短',
    straight: '直线作答',
    open_invalid: '开放题无效'
  },

  ERROR_MESSAGES: {
    AUTH_REQUIRED: '请先登录并绑定学号',
    STUDENT_NOT_BOUND: '请先在“我的”绑定学号',
    STUDENT_ALREADY_BOUND: '该学号已绑定其他微信',
    SURVEY_NOT_FOUND: '问卷不存在或已被删除',
    SURVEY_CLOSED: '问卷已截止',
    SELF_ANSWER_FORBIDDEN: '发布者不能作答自己的问卷',
    ALREADY_SUBMITTED: '你已经提交过这份问卷',
    SURVEY_HAS_RESPONSES: '该问卷已有作答，题目不可修改',
    FORBIDDEN: '没有权限执行此操作',
    POINTS_NOT_ENOUGH: '积分不足，请先完成他人问卷',
    CREDIT_NOT_ENOUGH: '信誉分不足 40，暂不能发布',
    ATTEMPT_EXPIRED: '作答已失效或问卷已截止',
    QUALITY_INVALID: '未通过质量核验',
    INCOMPLETE: '未答完',
    RATE_LIMITED: '操作过于频繁，请稍后再试',
    SERVER_ERROR: '服务异常，请稍后重试',
    NETWORK_ERROR: '网络异常，请稍后重试',
    INVALID_PARAMS: '参数不合法',
    NOT_FOUND: '接口不存在'
  }
};
