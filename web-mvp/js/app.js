/* ============================================================
 * 校园问卷互助积分平台 · 核心逻辑（原生 JS）
 *
 * localStorage:
 *   points     当前积分，初始 0
 *   credit     当前信誉分，初始 0；发布问答需 ≥ 40
 *   claimed    已领取的问卷 id 数组，例如 ["1","2"]
 *   surveys    用户发布的问卷数组（发布页只负责调用下面的接口）
 *   responses  作答记录，用于发布者统计与个人中心整理
 *   attempts   已开始但未提交的作答，用于逾期扣信誉分
 *
 * 发布页接入方式（publish.html 不需要改结构，只加调用）：
 *   var res = window.SurveyStore.create({
 *       title: "问卷标题",
 *       publisher: "匿名同学",        // 可省略，默认“我”
 *       category: "学习",             // 可省略，默认“其他”
 *       minutes: 3,                   // 可省略，默认 3
 *       startAt: 1731052800000,       // 必填：开始作答时间戳
 *       endAt: 1731657600000,         // 必填：截至作答时间戳
 *       cover: "",                    // 可选：压缩后的封面 data URL
 *       questions: [{
 *           q: "题目",
 *           type: "single",           // single | multiple | open
 *           options: ["选项A", "选项B"] // open 题不需要选项
 *       }]
 *   });
 *   if (!res.ok) { alert(res.error); return; }
 *   location.href = "detail.html?id=" + encodeURIComponent(res.id);
 *
 * 发布后问卷 locked:true；发布者可调用 SurveyStore.update(id, payload) 修改，
 * 填写者在详情页只读，无权修改题目。问卷不设正确答案，作答统计由
 * SurveyStore.stats(id) 汇总，仅发布者页面展示。
 * ============================================================ */
(function () {
    'use strict';

    var POINTS_KEY = 'points';
    var CREDIT_KEY = 'credit';
    var CLAIMED_KEY = 'claimed';
    var SURVEYS_KEY = 'surveys';
    var RESPONSES_KEY = 'responses';
    var ATTEMPTS_KEY = 'attempts';
    var CREDIT_LOG_KEY = 'creditLog';
    var POINTS_LOG_KEY = 'pointsLog';
    var ONBOARD_KEY = 'onboarded';
    var INITIAL_POINTS = 0;
    var INITIAL_CREDIT = 0;
    var REWARD = 5;              // 每份问卷固定积分奖励，与首页文案保持一致
    var CREDIT_REWARD = 5;       // 每份问卷固定信誉分奖励
    var PUBLISH_COST = 10;       // 发布一份问卷消耗的积分，与 README / 发布页文案一致
    var CREDIT_MAX = 100;
    var CREDIT_PUBLISH_MIN = 40;
    var ONBOARD_CREDIT = 40;
    var ONBOARD_POINTS = 10;
    var PENALTY_CREDIT = 20;     // 逾期未完成作答扣除的信誉分
    var MAX_QUESTIONS = 10;      // 单份问卷最多题数
    var MAX_OPTIONS = 6;         // 每题最多选项数
    var MAX_TITLE_LEN = 40;
    var MAX_Q_LEN = 100;
    var MAX_OPTION_LEN = 50;
    var MAX_OPEN_ANSWER_LEN = 100;
    var COVER_MAX_LEN = 450000;  // 封面素材压缩后的 data URL 上限，避免撑爆 localStorage
    var LOG_MAX = 60;
    var CATEGORIES = ['学习', '生活', '调研', '其他'];
    var CREDIT_LEVELS = [
        { min: 85, name: '优秀', badge: 'bg-success' },
        { min: 70, name: '良好', badge: 'bg-primary' },
        { min: 40, name: '一般', badge: 'bg-warning text-dark' },
        { min: 0, name: '较差', badge: 'bg-secondary' }
    ];

    /* ---------------- 内置问卷（演示用，不属于用户发布） ---------------- */
    // 内置演示问卷也带滚动时间窗，保证答题页始终能看到截止提示
    var DEMO_START_AT = Date.now() - 30 * 24 * 60 * 60 * 1000;
    var DEMO_END_AT = Date.now() + 30 * 24 * 60 * 60 * 1000;

    var SURVEYS = {
        '1': {
            id: '1',
            title: '大学生网购消费习惯调查',
            publisher: '张三',
            category: '生活',
            minutes: 3,
            reward: 5,
            startAt: DEMO_START_AT,
            endAt: DEMO_END_AT,
            mine: false,
            questions: [
                { q: '你平均每月网购几次？', options: ['1-2 次', '3-5 次', '6-10 次', '10 次以上'] },
                { q: '你常用的购物平台是？', options: ['淘宝 / 天猫', '京东', '拼多多', '抖音 / 快手'] },
                { q: '你单次网购的平均金额是？', options: ['50 元以内', '50-200 元', '200-500 元', '500 元以上'] },
                { q: '影响你下单的主要因素是？', options: ['价格优惠', '商品评价', '物流速度', '品牌口碑'] }
            ]
        },
        '2': {
            id: '2',
            title: '关于校园食堂满意度的调研',
            publisher: '李四',
            category: '调研',
            minutes: 2,
            reward: 5,
            startAt: DEMO_START_AT,
            endAt: DEMO_END_AT,
            mine: false,
            questions: [
                { q: '你每周在食堂就餐几次？', options: ['1-3 次', '4-6 次', '7-10 次', '10 次以上'] },
                { q: '你对食堂菜品的口味满意吗？', options: ['非常满意', '比较满意', '一般', '不满意'] },
                { q: '你认为食堂的价格如何？', options: ['很便宜', '比较合理', '偏贵', '太贵'] },
                { q: '你最希望食堂改进什么？', options: ['口味', '价格', '卫生', '排队效率'] }
            ]
        }
    };

    // 内置问卷的展示顺序（用户发布的会排在最前面）
    var BUILTIN_ORDER = ['1', '2'];

    /* ---------------- localStorage 安全读写 ---------------- */
    // 隐私模式 / 禁用存储时不抛错，页面其它逻辑照常运行
    function lsGet(key) {
        try { return localStorage.getItem(key); } catch (err) { return null; }
    }

    // 返回是否真正写入成功：涉及积分/领取记录的写操作必须检查结果
    function lsSet(key, value) {
        try { localStorage.setItem(key, value); return true; } catch (err) { return false; }
    }

    // 回滚用：写入失败后把某个键恢复到之前的值（之前不存在就删掉）
    function lsRestore(key, value) {
        if (value === null || value === undefined) {
            try { localStorage.removeItem(key); } catch (err) { /* 存储不可用时忽略 */ }
            return;
        }
        lsSet(key, value);
    }

    function readPoints() {
        var n = parseInt(lsGet(POINTS_KEY), 10);
        if (isNaN(n)) {
            n = INITIAL_POINTS;
            lsSet(POINTS_KEY, String(n));
        }
        return n;
    }

    function writePoints(n) {
        return lsSet(POINTS_KEY, String(n));
    }

    // 数据被手动改坏时不抛错，返回空数组，避免整个页面 JS 卡死
    function readClaimed() {
        try {
            var arr = JSON.parse(lsGet(CLAIMED_KEY) || '[]');
            return Array.isArray(arr) ? arr.map(String) : [];
        } catch (err) {
            return [];
        }
    }

    function writeClaimed(arr) {
        return lsSet(CLAIMED_KEY, JSON.stringify(arr));
    }

    function isClaimed(id) {
        return readClaimed().indexOf(String(id)) !== -1;
    }

    /* ---------------- 作答记录（统计用，仅发布者页面展示） ---------------- */
    function readResponses() {
        try {
            var arr = JSON.parse(lsGet(RESPONSES_KEY) || '[]');
            if (!Array.isArray(arr)) return [];

            var out = [];
            arr.forEach(function (item) {
                if (!item || !item.surveyId || !Array.isArray(item.answers)) return;
                out.push({
                    surveyId: String(item.surveyId),
                    at: parseInt(item.at, 10) || 0,
                    answers: item.answers
                });
            });
            return out;
        } catch (err) {
            return [];
        }
    }

    function writeResponses(arr) {
        return lsSet(RESPONSES_KEY, JSON.stringify(arr));
    }

    /* ---------------- 作答起点（逾期扣信誉分用） ---------------- */
    function readAttempts() {
        try {
            var arr = JSON.parse(lsGet(ATTEMPTS_KEY) || '[]');
            if (!Array.isArray(arr)) return [];

            var out = [];
            arr.forEach(function (item) {
                if (!item || !item.surveyId) return;
                out.push({
                    surveyId: String(item.surveyId),
                    startedAt: parseInt(item.startedAt, 10) || 0,
                    endAt: parseInt(item.endAt, 10) || 0,
                    penalized: item.penalized === true
                });
            });
            return out;
        } catch (err) {
            return [];
        }
    }

    function writeAttempts(arr) {
        return lsSet(ATTEMPTS_KEY, JSON.stringify(arr));
    }

    /* ---------------- 用户发布的问卷 ---------------- */
    function readSurveys() {
        try {
            var arr = JSON.parse(lsGet(SURVEYS_KEY) || '[]');
            if (!Array.isArray(arr)) return [];

            // 逐条归一化：任何一层结构不对就丢弃，避免 renderDetail 抛错中断整页 JS
            var out = [];
            arr.forEach(function (s) {
                if (!s || !s.id || !s.title) return;
                if (!Array.isArray(s.questions) || s.questions.length === 0) return;

                var questions = [];
                for (var i = 0; i < s.questions.length; i++) {
                    var item = s.questions[i] || {};
                    var q = String(item.q == null ? '' : item.q).trim();
                    var type = normalizeQuestionType(item.type);
                    var options = Array.isArray(item.options) ? item.options : [];
                    var clean = [];
                    for (var j = 0; j < options.length; j++) {
                        var opt = String(options[j] == null ? '' : options[j]).trim();
                        if (opt && clean.indexOf(opt) === -1) clean.push(opt);
                    }
                    if (!q) continue;
                    if (type !== 'open' && clean.length < 2) continue;

                    questions.push({
                        q: q,
                        type: type,
                        options: type === 'open' ? [] : clean.slice(0, MAX_OPTIONS)
                    });
                }
                if (questions.length === 0) return;

                var minutes = parseInt(s.minutes, 10);
                var startAt = parseInt(s.startAt, 10) || 0;
                var endAt = parseInt(s.endAt, 10) || 0;
                if (!startAt || !endAt || endAt <= startAt) {
                    startAt = 0;
                    endAt = 0;
                }
                out.push({
                    id: String(s.id),
                    title: String(s.title),
                    publisher: s.publisher ? String(s.publisher) : '我',
                    category: CATEGORIES.indexOf(s.category) !== -1 ? s.category : '其他',
                    minutes: isNaN(minutes) || minutes < 1 ? 3 : (minutes > 60 ? 60 : minutes),
                    reward: REWARD,
                    createdAt: parseInt(s.createdAt, 10) || 0,
                    startAt: startAt,
                    endAt: endAt,
                    mine: true,
                    locked: true,
                    cover: normalizeCover(s.cover),
                    questions: questions
                });
            });
            return out;
        } catch (err) {
            return [];
        }
    }

    function writeSurveys(arr) {
        return lsSet(SURVEYS_KEY, JSON.stringify(arr));
    }

    function makeSurveyId() {
        var id;
        var existing = readSurveys().map(function (s) { return String(s.id); });
        do {
            id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        } while (SURVEYS[id] || existing.indexOf(id) !== -1);
        return id;
    }

    // 用户输入进 innerHTML 前必须转义，防止 XSS
    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // 封面素材：只接受前端压缩后的图片 data URL；超长/格式不对就丢弃
    function normalizeCover(value) {
        if (typeof value !== 'string' || !value) return '';
        if (value.length > COVER_MAX_LEN) return '';
        if (!/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(value)) return '';
        return value;
    }

    function normalizeQuestionType(value) {
        if (value === 'multiple') return 'multiple';
        if (value === 'open') return 'open';
        return 'single';
    }

    // 校验并清洗题目；返回 { questions: [...] } 或 { error: "..." }
    function normalizeQuestions(raw) {
        if (!Array.isArray(raw) || raw.length === 0) {
            return { error: '至少需要 1 道题目' };
        }
        if (raw.length > MAX_QUESTIONS) {
            return { error: '最多支持 ' + MAX_QUESTIONS + ' 道题' };
        }

        var out = [];
        for (var i = 0; i < raw.length; i++) {
            var item = raw[i] || {};
            var q = String(item.q == null ? '' : item.q).trim();

            if (!q) return { error: '第 ' + (i + 1) + ' 题的题目不能为空' };
            if (q.length > MAX_Q_LEN) {
                return { error: '第 ' + (i + 1) + ' 题最多 ' + MAX_Q_LEN + ' 个字' };
            }

            var type = normalizeQuestionType(item.type);
            if (type === 'open') {
                out.push({
                    q: q,
                    type: type,
                    options: []
                });
                continue;
            }

            var options = Array.isArray(item.options) ? item.options : [];
            var clean = [];
            for (var j = 0; j < options.length; j++) {
                var opt = String(options[j] == null ? '' : options[j]).trim();
                if (!opt) continue; // 允许发布页留一行空选项，这里直接忽略
                if (opt.length > MAX_OPTION_LEN) {
                    return { error: '第 ' + (i + 1) + ' 题有选项超过 ' + MAX_OPTION_LEN + ' 个字' };
                }
                if (clean.indexOf(opt) !== -1) {
                    return { error: '第 ' + (i + 1) + ' 题有重复选项：' + opt };
                }
                clean.push(opt);
            }

            if (clean.length < 2) {
                return { error: '第 ' + (i + 1) + ' 题至少需要 2 个选项' };
            }
            if (clean.length > MAX_OPTIONS) {
                return { error: '第 ' + (i + 1) + ' 题最多 ' + MAX_OPTIONS + ' 个选项' };
            }

            out.push({
                q: q,
                type: type,
                options: clean
            });
        }
        return { questions: out };
    }

    // 发布入口：发布页调用它即可，校验和落库都在这里统一做
    function createSurvey(payload) {
        var data = payload || {};

        // 发布前提锁定：积分与信誉分分别给出提示，两者都不足时一起返回
        var points = readPoints();
        var credit = readCredit();
        var reasons = [];
        if (points < PUBLISH_COST) reasons.push('您的积分不足，请去参与问答赚取积分');
        if (credit < CREDIT_PUBLISH_MIN) reasons.push('信誉分不足');
        if (reasons.length > 0) {
            return {
                ok: false,
                code: points < PUBLISH_COST ? 'POINTS_NOT_ENOUGH' : 'CREDIT_NOT_ENOUGH',
                error: reasons.join('；')
            };
        }

        var title = String(data.title == null ? '' : data.title).trim();
        if (!title) return { ok: false, error: '请填写问卷标题' };
        if (title.length > MAX_TITLE_LEN) {
            return { ok: false, error: '标题最多 ' + MAX_TITLE_LEN + ' 个字' };
        }

        var publisher = String(data.publisher == null ? '' : data.publisher).trim() || '我';
        if (publisher.length > 20) publisher = publisher.slice(0, 20);

        var category = CATEGORIES.indexOf(data.category) !== -1 ? data.category : '其他';

        var minutes = parseInt(data.minutes, 10);
        if (isNaN(minutes) || minutes < 1) minutes = 3;
        if (minutes > 60) minutes = 60;

        var checked = normalizeQuestions(data.questions);
        if (checked.error) return { ok: false, error: checked.error };

        // 作答时间窗：开始 / 截至时间都必须齐全，且截至时间必须在未来
        var startAt = parseInt(data.startAt, 10);
        var endAt = parseInt(data.endAt, 10);
        if (!isFinite(startAt) || !isFinite(endAt) || startAt <= 0 || endAt <= 0) {
            return { ok: false, error: '请选择问答开始和截至日期' };
        }
        if (endAt <= startAt) {
            return { ok: false, error: '截至日期必须晚于开始日期' };
        }
        if (endAt <= Date.now()) {
            return { ok: false, error: '截至日期必须晚于当前时间' };
        }

        var survey = {
            id: makeSurveyId(),
            title: title,
            publisher: publisher,
            category: category,
            minutes: minutes,
            reward: REWARD,          // 奖励固定，忽略调用方传入的 reward，避免刷分
            createdAt: Date.now(),
            startAt: startAt,
            endAt: endAt,
            mine: true,
            locked: true,
            cover: normalizeCover(data.cover),
            questions: checked.questions
        };

        var list = readSurveys();
        list.unshift(survey);        // 新发布的排最前

        if (!writeSurveys(list)) {
            return { ok: false, code: 'STORAGE_ERROR', error: '本地存储不可用，问卷没有保存，请检查浏览器设置' };
        }
        if (!writePoints(points - PUBLISH_COST)) {
            // 扣分失败就回滚问卷，避免“没扣分却发布成功”
            writeSurveys(list.filter(function (s) { return s.id !== survey.id; }));
            return { ok: false, code: 'STORAGE_ERROR', error: '积分保存失败，问卷没有发布，请重试' };
        }

        if (!pushLog(POINTS_LOG_KEY, {
            time: Date.now(), delta: -PUBLISH_COST, reason: '发布问卷：' + title, after: readPoints()
        })) {
            writePoints(points);
            writeSurveys(list.filter(function (s) { return s.id !== survey.id; }));
            return { ok: false, code: 'STORAGE_ERROR', error: '积分流水保存失败，问卷没有发布，请重试' };
        }

        renderSurveyList();          // 若发布页没有列表容器，这里自动跳过
        refreshPoints();
        return { ok: true, id: survey.id, points: readPoints() };
    }

    // 发布者编辑：只处理自己发布的问卷；问卷锁定不阻止发布者修改
    function updateSurvey(id, payload) {
        var key = String(id == null ? '' : id);
        var data = payload || {};
        var list = readSurveys();
        var index = -1;
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].id) === key) {
                index = i;
                break;
            }
        }
        if (index === -1) {
            return { ok: false, code: 'NOT_FOUND', error: '问卷不存在，无法编辑' };
        }

        var title = String(data.title == null ? '' : data.title).trim();
        if (!title) return { ok: false, error: '请填写问卷标题' };
        if (title.length > MAX_TITLE_LEN) {
            return { ok: false, error: '标题最多 ' + MAX_TITLE_LEN + ' 个字' };
        }

        var publisher = String(data.publisher == null ? '' : data.publisher).trim() || '我';
        if (publisher.length > 20) publisher = publisher.slice(0, 20);

        var category = CATEGORIES.indexOf(data.category) !== -1 ? data.category : '其他';

        var minutes = parseInt(data.minutes, 10);
        if (isNaN(minutes) || minutes < 1) minutes = 3;
        if (minutes > 60) minutes = 60;

        var checked = normalizeQuestions(data.questions);
        if (checked.error) return { ok: false, error: checked.error };

        var original = list[index];

        var startAt = original.startAt || 0;
        var endAt = original.endAt || 0;
        if (data.startAt != null || data.endAt != null) {
            startAt = parseInt(data.startAt, 10);
            endAt = parseInt(data.endAt, 10);
            if (!isFinite(startAt) || !isFinite(endAt) || startAt <= 0 || endAt <= 0) {
                return { ok: false, error: '请选择问答开始和截至日期' };
            }
            if (endAt <= startAt) {
                return { ok: false, error: '截至日期必须晚于开始日期' };
            }
        }

        var updated = {
            id: original.id,
            title: title,
            publisher: publisher,
            category: category,
            minutes: minutes,
            reward: REWARD,
            createdAt: original.createdAt,
            startAt: startAt,
            endAt: endAt,
            mine: true,
            locked: true,
            cover: data.cover !== undefined ? normalizeCover(data.cover) : original.cover,
            questions: checked.questions
        };

        list[index] = updated;
        if (!writeSurveys(list)) {
            return {
                ok: false,
                code: 'STORAGE_ERROR',
                error: '本地存储不可用，修改没有保存，请检查浏览器设置'
            };
        }

        renderSurveyList();
        refreshPoints();
        return { ok: true, id: original.id, survey: updated };
    }

    function removeSurvey(id) {
        var key = String(id == null ? '' : id);
        var list = readSurveys();
        var next = list.filter(function (s) { return String(s.id) !== key; });
        if (next.length === list.length) return false; // 不存在或不是用户发布的

        if (!writeSurveys(next)) return false;
        // 问卷删除后没人再看统计，同时清掉作答与未完成记录，避免留下脏数据/误扣分
        writeResponses(readResponses().filter(function (r) {
            return r.surveyId !== key;
        }));
        writeAttempts(readAttempts().filter(function (a) {
            return a.surveyId !== key;
        }));
        renderSurveyList();
        return true;
    }

    function getMySurveys() {
        return readSurveys();
    }

    // 某份问卷最近一次作答时间：用于个人中心“我填写过的问卷”整理
    function getResponseTime(surveyId) {
        var list = readResponses().filter(function (r) {
            return r.surveyId === String(surveyId);
        });
        if (list.length === 0) return 0;
        return list[list.length - 1].at || 0;
    }

    // “我填写过的问卷”：按 claimed 顺序返回 id / 标题 / 奖励 / 填写时间，供个人中心列表使用
    function getClaimedSurveys() {
        return readClaimed().map(function (id) {
            var survey = getSurveyById(id);
            return {
                id: id,
                title: survey ? survey.title : '问卷已删除',
                reward: survey ? surveyReward(survey) : REWARD,
                exists: !!survey,
                time: getResponseTime(id)
            };
        });
    }

    // 用户发布的在前，内置的在后
    function getAllSurveys() {
        var builtin = BUILTIN_ORDER.map(function (id) { return SURVEYS[id]; })
            .filter(function (s) { return !!s; });
        return readSurveys().concat(builtin);
    }

    function getSurveyById(id) {
        var key = String(id == null ? '' : id);
        if (!key) return null;

        var list = readSurveys();
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].id) === key) return list[i];
        }
        return SURVEYS[key] || null;
    }

    function getQid() {
        try {
            var id = new URLSearchParams(window.location.search).get('id');
            return id == null ? '' : id; // 缺参时明确视为无效，而不是默认第 1 份
        } catch (err) {
            return '';
        }
    }

    function currentSurvey() {
        return getSurveyById(getQid());
    }

    /* ---------------- 作答统计与时间窗 ---------------- */
    // 一题一题汇总：选择题按“作答人数”统计占比，开放题收集文字作答
    function getSurveyStats(survey) {
        if (!survey) return null;
        var rows = readResponses().filter(function (r) {
            return r.surveyId === String(survey.id);
        });

        return survey.questions.map(function (item, qi) {
            if (item.type === 'open') {
                var texts = [];
                rows.forEach(function (r) {
                    var value = r.answers[qi];
                    var text = typeof value === 'string' ? value.trim() : '';
                    if (text) texts.push(text.slice(0, MAX_OPEN_ANSWER_LEN));
                });
                return { type: 'open', total: texts.length, answers: texts };
            }

            var counts = item.options.map(function () { return 0; });
            var total = 0;
            rows.forEach(function (r) {
                var value = r.answers[qi];
                var picked = [];
                if (typeof value === 'number') {
                    picked.push(value);
                } else if (Array.isArray(value)) {
                    value.forEach(function (v) {
                        if (typeof v === 'number') picked.push(v);
                    });
                }

                var valid = picked.filter(function (index) {
                    return index >= 0 && index < counts.length;
                });
                if (item.type !== 'multiple') valid = valid.slice(0, 1);
                if (valid.length === 0) return;

                total++;
                valid.forEach(function (index) {
                    counts[index]++;
                });
            });

            return { type: item.type, total: total, counts: counts };
        });
    }

    function appendResponse(survey, answers) {
        var list = readResponses();
        list.push({
            surveyId: String(survey.id),
            at: Date.now(),
            answers: answers
        });
        return writeResponses(list);
    }

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function formatDateTime(value) {
        var time = typeof value === 'number' ? value : parseInt(value, 10);
        if (!time || !isFinite(time)) return '';
        var d = new Date(time);
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
            ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }

    // none（内置无时间窗/历史数据） / before / open / ended
    function surveyWindowState(survey) {
        if (!survey || !survey.startAt || !survey.endAt) return 'none';
        var now = Date.now();
        if (now < survey.startAt) return 'before';
        if (now > survey.endAt) return 'ended';
        return 'open';
    }

    function isSurveyOpen(survey) {
        var state = surveyWindowState(survey);
        return state === 'none' || state === 'open';
    }

    /* ---------------- 逾期未完成：扣 20 信誉分（不扣积分） ---------------- */
    function markAttemptStarted(survey) {
        if (!survey || !survey.endAt || isClaimed(survey.id)) return;
        if (surveyWindowState(survey) !== 'open') return;

        var list = readAttempts();
        for (var i = 0; i < list.length; i++) {
            if (list[i].surveyId === String(survey.id)) return;
        }
        list.push({
            surveyId: String(survey.id),
            startedAt: Date.now(),
            endAt: survey.endAt,
            penalized: false
        });
        writeAttempts(list);
    }

    function removeAttempt(surveyId) {
        var key = String(surveyId);
        writeAttempts(readAttempts().filter(function (a) {
            return a.surveyId !== key;
        }));
    }

    function showPenaltyToast(count, deducted) {
        var box = document.createElement('div');
        box.className = 'alert alert-danger survey-toast';
        box.setAttribute('role', 'alert');
        box.textContent = '您有 ' + count + ' 份问卷未在截止日期前完成作答，已扣除 ' +
            deducted + ' 信誉分。';
        document.body.appendChild(box);
        window.setTimeout(function () {
            if (box.parentNode) box.parentNode.removeChild(box);
        }, 8000);
    }

    // 扫描已开始但未提交的作答：超过截止时间就扣 20 信誉分，每份只扣一次
    function applyExpiredPenalties() {
        var attempts = readAttempts();
        if (attempts.length === 0) return 0;

        var claimed = readClaimed();
        var beforeCredit = readCredit();
        var credit = beforeCredit;
        var now = Date.now();
        var changed = false;
        var count = 0;
        var expiredTitles = [];

        attempts.forEach(function (attempt) {
            if (attempt.penalized) return;
            if (claimed.indexOf(attempt.surveyId) !== -1) {
                attempt.penalized = true;
                changed = true;
                return;
            }

            var survey = getSurveyById(attempt.surveyId);
            var endAt = survey && survey.endAt ? survey.endAt : attempt.endAt;
            if (!endAt) {
                attempt.penalized = true; // 无有效截止时间的脏记录，直接作废
                changed = true;
                return;
            }
            if (now <= endAt) return;

            credit = Math.max(0, Math.min(CREDIT_MAX, credit - PENALTY_CREDIT));
            attempt.penalized = true;
            changed = true;
            count++;
            expiredTitles.push(survey ? survey.title : '问卷');
        });

        if (!changed) return 0;

        // 先落“已处理”标记，避免下一次加载重复扣分；标记写失败就什么都不做
        if (!writeAttempts(attempts)) return 0;
        if (credit !== beforeCredit && !writeCredit(credit)) {
            // 信誉分写失败时回退标记，保证下次还能重试
            attempts.forEach(function (attempt) {
                if (claimed.indexOf(attempt.surveyId) === -1 && attempt.penalized) {
                    attempt.penalized = false;
                }
            });
            writeAttempts(attempts);
            return 0;
        }

        // 未领取且已逾期的才真正扣分；已领取的只做标记
        var deducted = beforeCredit - credit;
        if (deducted > 0) {
            var reason = '未在截止时间内完成作答：' + expiredTitles.slice(0, 3).join('、');
            if (expiredTitles.length > 3) reason += ' 等 ' + expiredTitles.length + ' 份';
            pushLog(CREDIT_LOG_KEY, {
                time: now,
                delta: -deducted,
                reason: reason,
                after: credit
            });
            showPenaltyToast(count, deducted);
            refreshCredit();
            renderScoreCards();
            renderProfileCredit();
        }
        return count;
    }

    // 兼容 index.html、目录根路径，以及直接双击打开的 file:// 地址
    function isIndexPage() {
        var path = window.location.pathname;
        return /(^|\/)index\.html$/i.test(path) || /\/$/.test(path);
    }

    /* ---------------- 视图同步 ---------------- */
    // 所有页面顶栏积分 + profile.html 的积分位 + 任意 [data-points]
    function refreshPoints() {
        var pts = readPoints();
        var touched = [];
        ['top-points', 'profile-points'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) {
                el.textContent = pts;
                touched.push(el);
            }
        });
        document.querySelectorAll('[data-points]').forEach(function (el) {
            if (touched.indexOf(el) === -1) el.textContent = pts;
        });
    }

    /* ---------------- 信誉分与流水 ---------------- */
    function readCredit() {
        var n = parseInt(lsGet(CREDIT_KEY), 10);
        if (isNaN(n)) return INITIAL_CREDIT;
        return Math.max(0, Math.min(CREDIT_MAX, n));
    }

    function writeCredit(n) {
        var v = Math.max(0, Math.min(CREDIT_MAX, parseInt(n, 10) || 0));
        return lsSet(CREDIT_KEY, String(v));
    }

    function creditLevel(score) {
        var s = Math.max(0, Math.min(CREDIT_MAX, parseInt(score, 10) || 0));
        for (var i = 0; i < CREDIT_LEVELS.length; i++) {
            if (s >= CREDIT_LEVELS[i].min) return CREDIT_LEVELS[i];
        }
        return CREDIT_LEVELS[CREDIT_LEVELS.length - 1];
    }

    function readLogs(key) {
        try {
            var arr = JSON.parse(lsGet(key) || '[]');
            if (!Array.isArray(arr)) return [];
            return arr.filter(function (item) {
                return item && typeof item.time === 'number' && typeof item.delta === 'number';
            });
        } catch (err) { return []; }
    }

    function pushLog(key, entry) {
        var list = readLogs(key);
        list.unshift(entry);
        if (list.length > LOG_MAX) list = list.slice(0, LOG_MAX);
        return lsSet(key, JSON.stringify(list));
    }

    function addCredit(delta, reason) {
        var before = readCredit();
        var next = Math.max(0, Math.min(CREDIT_MAX, before + delta));
        if (!writeCredit(next)) return null;
        if (next !== before) {
            pushLog(CREDIT_LOG_KEY, {
                time: Date.now(), delta: next - before, reason: reason, after: next
            });
        }
        return next;
    }

    function formatTime(ts) {
        var d = new Date(ts);
        var two = function (n) { return n < 10 ? '0' + n : String(n); };
        return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) +
            ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
    }

    function renderLogList(boxId, key, emptyText) {
        var box = document.getElementById(boxId);
        if (!box) return;
        var list = readLogs(key);
        if (list.length === 0) {
            box.innerHTML = '<p class="text-muted small mb-0">' + emptyText + '</p>';
            return;
        }
        var html = '<ul class="list-unstyled mb-0">';
        list.forEach(function (item) {
            var up = item.delta > 0;
            html += '<li class="d-flex justify-content-between align-items-start border-bottom py-2">' +
                '<div class="me-2"><div class="small">' + esc(item.reason || '') + '</div>' +
                '<div class="text-muted" style="font-size:.75rem">' + formatTime(item.time) + '</div></div>' +
                '<span class="fw-bold text-nowrap ' + (up ? 'text-success' : 'text-danger') + '">' +
                (up ? '+' : '') + item.delta + '</span></li>';
        });
        box.innerHTML = html + '</ul>';
    }

    function refreshCredit() {
        var score = readCredit();
        document.querySelectorAll('[data-credit]').forEach(function (el) {
            el.textContent = score;
        });
        var bar = document.getElementById('credit-bar');
        if (bar) {
            bar.style.width = score + '%';
            bar.className = 'progress-bar ' + creditLevel(score).badge;
            var track = bar.parentNode;
            if (track && track.setAttribute) {
                track.setAttribute('aria-valuenow', String(score));
            }
        }
    }

    // 首页双分卡片：积分与信誉分各占一块，数值都由 localStorage 驱动
    function renderScoreCards() {
        var box = document.getElementById('score-cards');
        if (!box) return;
        var points = readPoints();
        var credit = readCredit();
        var level = creditLevel(credit);
        var onboarded = lsGet(ONBOARD_KEY) === '1';

        var html = '' +
            '<div class="col-6">' +
                '<div class="card h-100 shadow-sm border-0 rounded-4">' +
                    '<div class="card-body p-3">' +
                        '<div class="text-muted small">我的积分</div>' +
                        '<div class="d-flex align-items-end gap-1">' +
                            '<span class="display-5 fw-bold text-primary lh-1" data-points>' + points + '</span>' +
                            '<span class="text-muted small mb-1">分</span>' +
                        '</div>' +
                        '<p class="text-muted small mb-0 mt-2">完成 +5 · 发布 -10</p>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="col-6">' +
                '<div class="card h-100 shadow-sm border-0 rounded-4">' +
                    '<div class="card-body p-3">' +
                        '<div class="d-flex justify-content-between align-items-center">' +
                            '<div class="text-muted small">我的信誉分</div>' +
                            '<span id="credit-level" class="badge ' + level.badge + '">' + level.name + '</span>' +
                        '</div>' +
                        '<div class="d-flex align-items-end gap-1">' +
                            '<span class="display-5 fw-bold lh-1" data-credit>' + credit + '</span>' +
                            '<span class="text-muted small mb-1">/100</span>' +
                        '</div>' +
                        '<div class="progress mt-2" style="height:6px" role="progressbar" aria-label="信誉分" ' +
                            'aria-valuenow="' + credit + '" aria-valuemin="0" aria-valuemax="100">' +
                            '<div id="credit-bar" class="progress-bar ' + level.badge + '" style="width:' + credit + '%"></div>' +
                        '</div>' +
                        (onboarded
                            ? '<a class="btn btn-sm btn-outline-primary w-100 mt-2" href="profile.html">查看记录</a>'
                            : '<button type="button" class="btn btn-sm btn-success w-100 mt-2" ' +
                              'onclick="claimOnboard()">新人任务 +40</button>') +
                        '<p class="text-muted mb-0 mt-1" style="font-size:.72rem">' +
                            (onboarded
                                ? '完成问卷 +5 · 信誉分 ≥40 可发布'
                                : '完成后信誉 +40，达到 40 才能发布') +
                        '</p>' +
                    '</div>' +
                '</div>' +
            '</div>';
        box.innerHTML = html;
    }

    function renderProfileCredit() {
        var scoreEl = document.getElementById('profile-credit');
        if (!scoreEl) return;
        var score = readCredit();
        var level = creditLevel(score);
        scoreEl.textContent = score;
        var badge = document.getElementById('profile-credit-level');
        if (badge) {
            badge.textContent = level.name;
            badge.className = 'badge ' + level.badge;
        }
        var bar = document.getElementById('profile-credit-bar');
        if (bar) {
            bar.style.width = score + '%';
            bar.className = 'progress-bar ' + level.badge;
        }
        var onboardBtn = document.getElementById('onboard-btn');
        if (onboardBtn) onboardBtn.classList.toggle('d-none', lsGet(ONBOARD_KEY) === '1');
        renderLogList('credit-timeline', CREDIT_LOG_KEY, '还没有信誉分变动记录');
        renderLogList('points-timeline', POINTS_LOG_KEY, '还没有积分变动记录');
    }

    function claimOnboard() {
        if (lsGet(ONBOARD_KEY) === '1') return false;

        var beforeCredit = readCredit();
        var beforePoints = readPoints();
        // 先把旧值存一份：任何一步写失败都整体回滚，避免“积分加了、任务没标记”
        var backup = {
            credit: lsGet(CREDIT_KEY),
            points: lsGet(POINTS_KEY),
            creditLog: lsGet(CREDIT_LOG_KEY),
            pointsLog: lsGet(POINTS_LOG_KEY),
            onboarded: lsGet(ONBOARD_KEY)
        };

        function rollback() {
            lsRestore(CREDIT_KEY, backup.credit);
            lsRestore(POINTS_KEY, backup.points);
            lsRestore(CREDIT_LOG_KEY, backup.creditLog);
            lsRestore(POINTS_LOG_KEY, backup.pointsLog);
            lsRestore(ONBOARD_KEY, backup.onboarded);
            refreshPoints();
            refreshCredit();
            renderScoreCards();
            renderProfileCredit();
        }

        if (!writeCredit(beforeCredit + ONBOARD_CREDIT)) {
            window.alert('信誉分保存失败，请重试');
            return false;
        }
        if (!writePoints(beforePoints + ONBOARD_POINTS)) {
            rollback();
            window.alert('积分保存失败，请重试');
            return false;
        }

        // 信誉分可能已经封顶，流水按“实际增加”记，避免 98→100 却写 +40
        var afterCredit = readCredit();
        var creditLogOk = true;
        if (afterCredit !== beforeCredit) {
            creditLogOk = pushLog(CREDIT_LOG_KEY, {
                time: Date.now(),
                delta: afterCredit - beforeCredit,
                reason: '新人任务：阅读互助规则',
                after: afterCredit
            });
        }
        var pointsLogOk = pushLog(POINTS_LOG_KEY, {
            time: Date.now(), delta: ONBOARD_POINTS, reason: '新人任务奖励', after: readPoints()
        });

        // onboarded 是防重复领取的关键，写入失败必须回滚，否则可以反复点
        if (!creditLogOk || !pointsLogOk || !lsSet(ONBOARD_KEY, '1')) {
            rollback();
            window.alert('新人任务保存失败，请检查浏览器存储后重试');
            return false;
        }

        refreshPoints();
        refreshCredit();
        renderScoreCards();
        renderProfileCredit();
        return true;
    }

    function demoPenalty() {
        if (!window.confirm('演示用：模拟一次问卷逾期未回收，扣 20 信誉分？')) return false;
        var next = addCredit(-20, '演示：问卷逾期未回收');
        if (next === null) {
            window.alert('信誉分保存失败，请重试');
            return false;
        }
        refreshCredit();
        renderScoreCards();
        renderProfileCredit();
        return true;
    }

    // 按钮/链接变灰：详情页按钮、首页卡片都走这里
    function markDone(el) {
        if (el.classList.contains('btn-success')) {
            el.classList.replace('btn-success', 'btn-secondary');
        }
        if (el.classList.contains('btn-outline-primary')) {
            el.classList.replace('btn-outline-primary', 'btn-secondary');
        }
        el.classList.add('disabled');
        el.textContent = '已完成填写';
        el.setAttribute('aria-disabled', 'true');
        if (el.tagName === 'A') {
            el.removeAttribute('href'); // 链接按钮：去掉跳转
        } else {
            el.disabled = true;          // 普通按钮：禁用点击
        }
    }

    function surveyMinutes(survey) {
        var n = parseInt(survey && survey.minutes, 10);
        return isNaN(n) || n < 1 ? 3 : n;
    }

    function surveyReward(survey) {
        var n = parseInt(survey && survey.reward, 10);
        return isNaN(n) || n < 1 ? REWARD : n;
    }

    function surveyMeta(survey) {
        var meta = '发布者: ' + survey.publisher +
            ' · 预计耗时: ' + surveyMinutes(survey) + ' 分钟' +
            ' · 共 ' + survey.questions.length + ' 题';
        if (survey.endAt) meta += ' · 截至: ' + formatDateTime(survey.endAt);
        return meta;
    }

    // 单张首页卡片：仍是 <a href="detail.html?id=...">，置灰逻辑无需改动
    function surveyCardHtml(survey) {
        var badge = survey.mine
            ? ' <span class="badge bg-info text-dark align-middle">我发布的</span>'
            : '';

        return '' +
            '<div class="col-12 mb-3">' +
                '<div class="card shadow-sm">' +
                    '<div class="card-body">' +
                        '<h5 class="card-title text-primary">' + esc(survey.title) + badge + '</h5>' +
                        '<p class="card-text text-muted small">' +
                            '发布者: ' + esc(survey.publisher) +
                            ' | 预计耗时: ' + surveyMinutes(survey) + '分钟' +
                            ' | 共 ' + survey.questions.length + ' 题' +
                        '</p>' +
                        '<a href="detail.html?id=' + encodeURIComponent(survey.id) + '" ' +
                           'class="btn btn-outline-primary w-100">' +
                            '去填写 (赚 ' + surveyReward(survey) + ' 积分)' +
                        '</a>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    // 首页列表：内置问卷 + 用户发布的问卷，全部由数据渲染
    function renderSurveyList() {
        var box = document.getElementById('question-list');
        if (!box) return; // 非首页（详情页/发布页）没有这个容器

        var all = getAllSurveys();
        if (all.length === 0) {
            box.innerHTML = '<div class="col-12 text-center text-muted py-5">' +
                '还没有问卷，点击底部“发布问卷”创建第一份吧</div>';
            return;
        }

        var html = '';
        all.forEach(function (survey) {
            html += surveyCardHtml(survey);
        });
        box.innerHTML = html;

        syncIndexCards(); // 渲染完成后按 claimed 置灰
    }

    // 首页：只处理 href 里带 detail.html?id= 的链接，id 从 href 解析
    function syncIndexCards() {
        if (!isIndexPage()) return;

        var claimed = readClaimed();
        document.querySelectorAll('a[href*="detail.html?id="]').forEach(function (a) {
            var href = a.getAttribute('href') || '';
            var matched = href.match(/detail\.html\?id=([^&#]+)/);
            if (!matched) return;

            var id;
            try {
                id = decodeURIComponent(matched[1]);
            } catch (err) {
                id = matched[1];
            }
            if (claimed.indexOf(id) !== -1) markDone(a);
        });
    }

    // 详情页：按钮与领取状态保持一致
    function syncDetailButton() {
        var btn = document.getElementById('claim-btn');
        if (!btn) return;
        var survey = currentSurvey();
        if (!survey) {
            showMissingSurvey(); // 跨标签删除时同步清掉残留题目
            btn.className = 'btn btn-secondary w-100 py-2 mt-2';
            btn.disabled = true;
            btn.textContent = '问卷不可用';
            return;
        }
        if (isClaimed(getQid())) {
            markDone(btn);
            return;
        }

        var state = surveyWindowState(survey);
        if (state === 'before') {
            btn.className = 'btn btn-secondary w-100 py-2 mt-2';
            btn.disabled = true;
            btn.textContent = '问答尚未开始，暂不可作答';
            return;
        }
        if (state === 'ended') {
            btn.className = 'btn btn-secondary w-100 py-2 mt-2';
            btn.disabled = true;
            btn.textContent = '问答已截止，作答无效';
            return;
        }
        updateClaimButtonState(); // 未领取时按答题进度控制灰/绿
    }

    function syncAll() {
        refreshPoints();
        refreshCredit();
        renderScoreCards();
        renderProfileCredit();
        renderSurveyList();
        syncDetailButton();
    }

    /* ---------------- 详情页渲染 ---------------- */
    // 问卷不存在/已被删除时的统一空状态：标题、说明、题目区一起处理
    function showMissingSurvey() {
        var title = document.getElementById('q-title');
        var meta = document.getElementById('q-meta');
        var body = document.getElementById('q-body');
        if (title) title.textContent = '问卷不存在';
        if (meta) meta.textContent = '链接可能有误，或这份问卷已被发布者删除。';
        if (body) {
            body.innerHTML = '<div class="alert alert-warning mb-0">' +
                '没有找到这份问卷，请返回首页重新选择。</div>';
        }
    }

    function questionTypeLabel(type) {
        if (type === 'multiple') return '多选';
        if (type === 'open') return '开放';
        return '单选';
    }

    function disableAnswerInputs(root) {
        var controls = root.querySelectorAll('input, textarea, select');
        for (var i = 0; i < controls.length; i++) {
            controls[i].disabled = true;
        }
    }

    function renderDetail() {
        var body = document.getElementById('q-body');
        if (!body) return; // 首页等页面没有这个容器，直接跳过

        var title = document.getElementById('q-title');
        var meta = document.getElementById('q-meta');
        var survey = currentSurvey();

        if (!survey) {
            showMissingSurvey();
            return;
        }

        if (title) title.textContent = survey.title;
        if (meta) meta.textContent = surveyMeta(survey);

        var state = surveyWindowState(survey);
        var stats = survey.mine ? getSurveyStats(survey) : null;
        var statsUi = window.SurveyStatsUI || null;

        var html = '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">' +
            '<span class="badge bg-warning text-dark">🔒 已锁定</span>';
        if (survey.mine) {
            html += '<a class="btn btn-sm btn-outline-primary" href="publish.html?edit=' +
                encodeURIComponent(survey.id) + '">编辑问卷</a>';
        }
        html += '</div>';
        html += '<p class="small text-muted mb-3">本问卷已锁定：填写者无权更改题目。</p>';
        if (survey.mine) {
            html += '<p class="small text-muted mb-2">发布者视图：题目下方展示作答统计，仅发布者可见。</p>';
        }

        if (survey.startAt && survey.endAt) {
            html += '<div class="alert ' + (state === 'ended' ? 'alert-danger' : 'alert-info') +
                ' survey-deadline-alert mb-3" role="status">' +
                '<div class="fw-semibold">请注意在截至日期内完成作答，否则视为无效</div>' +
                '<div class="small mb-0">作答时间：' + formatDateTime(survey.startAt) +
                ' 至 ' + formatDateTime(survey.endAt) + '</div>';
            if (state === 'before') {
                html += '<div class="small mb-0">问答尚未开始，开始后才能作答。</div>';
            } else if (state === 'ended') {
                html += '<div class="small mb-0">问答已截止，当前作答无效。</div>';
            }
            html += '</div>';
        }

        if (survey.cover) {
            html += '<img class="survey-cover" src="' + survey.cover + '" alt="问卷封面素材">';
        }

        survey.questions.forEach(function (item, qi) {
            var name = 'q' + (qi + 1);
            var type = item.type === 'open' ? 'open'
                : (item.type === 'multiple' ? 'multiple' : 'single');
            var stat = stats ? stats[qi] : null;

            html += '<div class="mb-3 survey-question">';
            html += '<p class="fw-semibold mb-2">' + (qi + 1) + '. ' + esc(item.q) +
                ' <span class="badge bg-light text-secondary border">' +
                questionTypeLabel(type) + '</span></p>';

            if (type === 'open') {
                html += '<textarea class="form-control survey-open-input" name="' + name + '" ' +
                    'rows="3" placeholder="请输入你的看法" aria-label="开放题作答"></textarea>' +
                    '<div class="d-flex justify-content-between align-items-center small text-muted mt-1">' +
                        '<span class="survey-limit-hint text-danger d-none" role="alert">仅可输入100字</span>' +
                        '<span class="ms-auto"><span class="open-count">0</span>/' +
                            MAX_OPEN_ANSWER_LEN + '</span>' +
                    '</div>';
                if (stat) {
                    html += '<div class="mt-2">' +
                        (statsUi ? statsUi.openBlockHtml(stat)
                            : '<p class="survey-stat-empty mb-0">暂无作答数据</p>') +
                        '</div>';
                }
            } else {
                item.options.forEach(function (opt, oi) {
                    var id = name + '_' + oi;
                    html += '<div class="form-check">';
                    html += '<input class="form-check-input" type="' +
                        (type === 'multiple' ? 'checkbox' : 'radio') +
                        '" name="' + name + '" id="' + id + '" value="' + oi + '">';
                    html += '<label class="form-check-label" for="' + id + '">' +
                        String.fromCharCode(65 + oi) + '. ' + esc(opt) + '</label>';
                    html += '</div>';
                    if (stat && stat.total > 0 && statsUi) {
                        html += statsUi.optionRowHtml(stat.counts[oi], stat.total);
                    }
                });
                if (stat && stat.total === 0) {
                    html += '<p class="survey-stat-empty mb-0 mt-2">暂无作答数据</p>';
                }
            }

            html += '</div>';
        });

        body.innerHTML = html;
        if (state === 'before' || state === 'ended' || isClaimed(survey.id)) {
            disableAnswerInputs(body);
        }
        syncDetailButton();
    }

    // 提交成功后把本次答案回填到已禁用的控件里，避免“提交完答案变空白”
    function fillSubmittedAnswers(survey, answers) {
        var body = document.getElementById('q-body');
        if (!body) return;

        survey.questions.forEach(function (item, qi) {
            var name = 'q' + (qi + 1);
            var value = answers[qi];

            if (item.type === 'open') {
                var textarea = body.querySelector('textarea[name="' + name + '"]');
                if (!textarea) return;
                textarea.value = typeof value === 'string' ? value : '';
                var counter = textarea.closest('.mb-3').querySelector('.open-count');
                if (counter) counter.textContent = String(textarea.value.length);
                textarea.disabled = true;
                return;
            }

            var inputs = body.querySelectorAll('input[name="' + name + '"]');
            for (var i = 0; i < inputs.length; i++) {
                var index = parseInt(inputs[i].value, 10);
                if (item.type === 'multiple') {
                    inputs[i].checked = Array.isArray(value) && value.indexOf(index) !== -1;
                } else {
                    inputs[i].checked = index === value;
                }
                inputs[i].disabled = true;
            }
        });
    }

    /* ---------------- 表单校验：必须答完所有题 ---------------- */
    function markMissing(block) {
        if (!block) return;
        block.style.outline = '2px solid #dc3545';
        block.style.outlineOffset = '4px';
        block.style.borderRadius = '6px';
    }

    function clearMissing(block) {
        if (!block) return;
        block.style.outline = '';
        block.style.outlineOffset = '';
        block.style.borderRadius = '';
    }

    function findAnswerControl(body, name) {
        var control = body.querySelector('input[name="' + name + '"]');
        if (control) return control;
        return body.querySelector('textarea[name="' + name + '"]');
    }

    function isQuestionAnswered(item, name, body) {
        if (item.type === 'open') {
            var textarea = body.querySelector('textarea[name="' + name + '"]');
            return !!textarea && textarea.value.trim() !== '';
        }
        return !!body.querySelector('input[name="' + name + '"]:checked');
    }

    // 逐题检查，给所有未答题的题块加红框，返回是否全部答完
    function validateAnswers() {
        var body = document.getElementById('q-body');
        var survey = currentSurvey();
        if (!body || !survey) return false;

        var missing = [];

        survey.questions.forEach(function (item, qi) {
            var name = 'q' + (qi + 1);
            var control = findAnswerControl(body, name);
            var block = control ? control.closest('.mb-3') : null;
            if (!block) return;

            if (isQuestionAnswered(item, name, body)) {
                clearMissing(block);
            } else {
                markMissing(block);
                missing.push(block);
            }
        });

        if (missing.length === 0) return true;

        window.alert('还有 ' + missing.length + ' 道题没回答，填完才能领取积分哦～');
        try {
            if (missing[0].scrollIntoView) {
                missing[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } catch (err) { /* 部分环境不支持 scrollIntoView 配置对象，忽略 */ }
        return false;
    }

    // 选中某题后立刻消掉该题的红框，并记录“已开始作答”用于逾期判定
    function onAnswerChange(e) {
        var target = e.target;
        if (!target || !target.name || !/^q\d+$/.test(target.name)) return;
        var body = document.getElementById('q-body');
        var control = body ? findAnswerControl(body, target.name) : null;
        if (control) clearMissing(control.closest('.mb-3'));
        markAttemptStarted(currentSurvey());
        updateClaimButtonState(); // 答完最后一题 → 按钮自动变绿可点
    }

    // 开放题：超过 100 字立即截断并给出提示，同时刷新字数与按钮状态
    function onAnswerInput(e) {
        var target = e.target;
        if (!target || !target.name || !/^q\d+$/.test(target.name)) return;
        if (target.tagName !== 'TEXTAREA') return;

        var block = target.closest('.mb-3');
        var hint = block ? block.querySelector('.survey-limit-hint') : null;
        var counter = block ? block.querySelector('.open-count') : null;

        if (target.value.length > MAX_OPEN_ANSWER_LEN) {
            target.value = target.value.slice(0, MAX_OPEN_ANSWER_LEN);
            if (hint) {
                hint.classList.remove('d-none');
                if (hint.hideTimer) window.clearTimeout(hint.hideTimer);
                hint.hideTimer = window.setTimeout(function () {
                    hint.classList.add('d-none');
                }, 2000);
            }
        }
        if (counter) counter.textContent = String(target.value.length);
        if (block) clearMissing(block);
        markAttemptStarted(currentSurvey());
        updateClaimButtonState();
    }

    // 按“还剩几题没答”切换提交按钮：灰=不可点，绿=可领取
    function updateClaimButtonState() {
        var btn = document.getElementById('claim-btn');
        var body = document.getElementById('q-body');
        var survey = currentSurvey();
        if (!btn || !body || !survey || isClaimed(getQid())) return;
        if (!isSurveyOpen(survey)) {
            if (surveyWindowState(survey) === 'ended') applyExpiredPenalties();
            syncDetailButton(); // 页面停留期间截止时间到了，立即切换成不可作答
            return;
        }

        var left = 0;
        survey.questions.forEach(function (item, qi) {
            if (!isQuestionAnswered(item, 'q' + (qi + 1), body)) left++;
        });

        if (left === 0) {
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-success');
            btn.disabled = false;
            btn.textContent = '提交问卷并领取积分';
        } else {
            btn.classList.remove('btn-success');
            btn.classList.add('btn-secondary');
            btn.disabled = true;
            btn.textContent = '还差 ' + left + ' 题，填完即可领取';
        }
    }

    // 收集本次作答：单选存下标，多选存下标数组，开放题存文字
    function collectAnswers(survey) {
        var body = document.getElementById('q-body');
        return survey.questions.map(function (item, qi) {
            var name = 'q' + (qi + 1);
            if (item.type === 'open') {
                var textarea = body.querySelector('textarea[name="' + name + '"]');
                return textarea ? textarea.value.trim().slice(0, MAX_OPEN_ANSWER_LEN) : '';
            }

            var picked = [];
            body.querySelectorAll('input[name="' + name + '"]:checked').forEach(function (input) {
                var index = parseInt(input.value, 10);
                if (isFinite(index)) picked.push(index);
            });
            picked.sort(function (a, b) { return a - b; });
            if (item.type === 'multiple') return picked;
            return picked.length ? picked[0] : null;
        });
    }

    /* ---------------- 业务：完成问卷，积分 +5、信誉分 +5 ---------------- */
    function claimPoints() {
        var qid = getQid();
        var survey = currentSurvey();
        var claimed = readClaimed();
        var btn = document.getElementById('claim-btn');

        if (!survey) return false; // 问卷不存在（已删除或链接错误）

        // 防重复：已领过不加分，按钮保持灰色
        if (claimed.indexOf(qid) !== -1) {
            if (btn) markDone(btn);
            return false;
        }

        // 时间窗校验：未开始不能答；已截止视为无效，已开始的按逾期扣信誉分
        var state = surveyWindowState(survey);
        if (state === 'before') {
            window.alert('问答尚未开始，暂时不能作答');
            syncDetailButton();
            return false;
        }
        if (state === 'ended') {
            var beforePenalty = readCredit();
            applyExpiredPenalties();
            var deducted = beforePenalty - readCredit();
            window.alert('问答已截止，作答无效' +
                (deducted > 0 ? '；未在截止时间内完成作答，已扣除 ' + deducted + ' 信誉分' : ''));
            syncDetailButton();
            return false;
        }

        // 未答完不放行：不加分、不写 claimed
        if (!validateAnswers()) return false;

        var answers = collectAnswers(survey);
        var beforePoints = readPoints();
        var beforeCredit = readCredit();
        var backup = {
            claimed: lsGet(CLAIMED_KEY),
            points: lsGet(POINTS_KEY),
            credit: lsGet(CREDIT_KEY),
            creditLog: lsGet(CREDIT_LOG_KEY),
            pointsLog: lsGet(POINTS_LOG_KEY),
            responses: lsGet(RESPONSES_KEY)
        };

        function rollback() {
            lsRestore(CLAIMED_KEY, backup.claimed);
            lsRestore(POINTS_KEY, backup.points);
            lsRestore(CREDIT_KEY, backup.credit);
            lsRestore(CREDIT_LOG_KEY, backup.creditLog);
            lsRestore(POINTS_LOG_KEY, backup.pointsLog);
            lsRestore(RESPONSES_KEY, backup.responses);
            refreshPoints();
            refreshCredit();
            renderScoreCards();
            renderProfileCredit();
        }

        // 领取记录 + 积分 + 信誉分 + 作答记录：任何一步失败都整体回滚
        claimed.push(qid);
        if (!writeClaimed(claimed)) {
            window.alert('本地存储不可用，领取记录没有保存，请检查浏览器设置');
            return false;
        }
        if (!writePoints(beforePoints + surveyReward(survey))) {
            rollback();
            window.alert('积分保存失败，请重试');
            return false;
        }
        if (addCredit(CREDIT_REWARD, '完成问卷：' + survey.title) === null) {
            rollback();
            window.alert('信誉分保存失败，请重试');
            return false;
        }
        if (!pushLog(POINTS_LOG_KEY, {
            time: Date.now(),
            delta: surveyReward(survey),
            reason: '完成问卷：' + survey.title,
            after: readPoints()
        })) {
            rollback();
            window.alert('积分流水保存失败，请重试');
            return false;
        }
        if (!appendResponse(survey, answers)) {
            rollback();
            window.alert('作答记录保存失败，请重试');
            return false;
        }
        removeAttempt(survey.id);

        refreshPoints();
        refreshCredit();
        renderScoreCards();
        renderProfileCredit();

        // 重新渲染题库，发布者能立刻在选项下方看到包含本次作答的统计
        renderDetail();
        fillSubmittedAnswers(survey, answers);

        var creditGain = readCredit() - beforeCredit;
        var tip = document.getElementById('tip');
        if (tip) {
            tip.textContent = '积分 +' + surveyReward(survey) + '、信誉分 +' + creditGain +
                ' 成功！当前积分 ' + readPoints() + ' 分，信誉分 ' + readCredit() + ' 分';
            tip.style.display = 'block';
        }
        return true;
    }

    /* ---------------- 一键重置演示数据 ---------------- */
    // 清积分 / 信誉分 / 领取 / 流水 / 作答 / 逾期记录，保留用户发布的问卷
    function resetDemoData() {
        if (!window.confirm('确定要清空积分、信誉分、领取、流水与作答记录吗？已发布的问卷会保留。')) return false;

        var entries = [
            [POINTS_KEY, String(INITIAL_POINTS)],
            [CREDIT_KEY, String(INITIAL_CREDIT)],
            [CLAIMED_KEY, '[]'],
            [CREDIT_LOG_KEY, '[]'],
            [POINTS_LOG_KEY, '[]'],
            [RESPONSES_KEY, '[]'],
            [ATTEMPTS_KEY, '[]'],
            [ONBOARD_KEY, '0']
        ];
        var backup = entries.map(function (entry) { return lsGet(entry[0]); });

        for (var i = 0; i < entries.length; i++) {
            if (!lsSet(entries[i][0], entries[i][1])) {
                // 重置要么全成功、要么全不动，避免只清了一半
                for (var j = 0; j <= i; j++) {
                    lsRestore(entries[j][0], backup[j]);
                }
                window.alert('重置失败：浏览器本地存储不可用，请检查后重试');
                return false;
            }
        }

        window.location.reload();
        return true;
    }

    /* ---------------- 初始化 ---------------- */
    function init() {
        readPoints();      // 首次进入写入初始 0
        readCredit();      // 首次进入写入初始信誉分 0
        applyExpiredPenalties(); // 上次开始作答但已过截止时间的，先扣 20 信誉分
        refreshPoints();
        refreshCredit();
        renderScoreCards();
        renderProfileCredit();
        renderDetail();    // 仅详情页生效
        var body = document.getElementById('q-body');
        if (body) {
            body.addEventListener('change', onAnswerChange);
            body.addEventListener('input', onAnswerInput);
        }
        syncAll();         // 首页列表 / 详情按钮按领取状态置灰
    }

    // 暴露给 HTML 的 onclick
    window.claimPoints = claimPoints;
    window.resetDemoData = resetDemoData;
    window.claimOnboard = claimOnboard;
    window.demoPenalty = demoPenalty;

    // 发布页与其他页面统一走这个接口
    var store = {
        create: createSurvey,
        update: updateSurvey,
        remove: removeSurvey,
        get: getSurveyById,
        list: getAllSurveys,
        mine: getMySurveys,
        history: getClaimedSurveys,
        stats: function (id) { return getSurveyStats(getSurveyById(id)); },
        categories: CATEGORIES.slice(),
        reward: REWARD,
        creditReward: CREDIT_REWARD,
        publishCost: PUBLISH_COST,
        creditMin: CREDIT_PUBLISH_MIN,
        penaltyCredit: PENALTY_CREDIT,
        coverMaxLen: COVER_MAX_LEN,
        openAnswerMax: MAX_OPEN_ANSWER_LEN,
        getUser: function () {
            var credit = readCredit();
            return {
                score: readPoints(),
                credit: credit,
                level: creditLevel(credit).name,
                onboarded: lsGet(ONBOARD_KEY) === '1'
            };
        },
        getCredit: readCredit,
        onboard: claimOnboard
    };

    Object.defineProperty(store, 'points', {
        get: readPoints,
        enumerable: true
    });

    Object.defineProperty(store, 'credit', {
        get: readCredit,
        enumerable: true
    });

    window.SurveyStore = store;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init(); // 脚本被动态注入或加载较晚时也能立即执行
    }

    // 跨标签页同步：发布页写入后，已打开的首页会自动刷新出新卡片
    window.addEventListener('storage', function (e) {
        if (e.key === null || e.key === POINTS_KEY ||
            e.key === CLAIMED_KEY || e.key === SURVEYS_KEY ||
            e.key === RESPONSES_KEY || e.key === ATTEMPTS_KEY ||
            e.key === CREDIT_KEY || e.key === CREDIT_LOG_KEY ||
            e.key === POINTS_LOG_KEY || e.key === ONBOARD_KEY) {
            syncAll();
        }
    });

    // 从详情页返回（含浏览器前进/后退）时重新同步，并补算逾期记录
    window.addEventListener('pageshow', function () {
        applyExpiredPenalties();
        syncAll();
    });
})();
