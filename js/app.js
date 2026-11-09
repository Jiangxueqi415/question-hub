/* ============================================================
 * 校园问卷互助积分平台 · 核心逻辑（原生 JS）
 *
 * localStorage:
 *   points  当前积分，初始 50
 *   claimed 已领取的问卷 id 数组，例如 ["1","2"]
 *   surveys 用户发布的问卷数组（发布页只负责调用下面的接口）
 *
 * 发布页接入方式（publish.html 不需要改结构，只加调用）：
 *   var res = window.SurveyStore.create({
 *       title: "问卷标题",
 *       publisher: "我",              // 可省略，默认“我”
 *       category: "学习",             // 可省略，默认“其他”
 *       minutes: 3,                   // 可省略，默认 3
 *       questions: [{ q: "题目", options: ["选项A", "选项B"] }]
 *   });
 *   if (!res.ok) { alert(res.error); return; }
 *   location.href = "detail.html?id=" + encodeURIComponent(res.id);
 * ============================================================ */
(function () {
    'use strict';

    var POINTS_KEY = 'points';
    var CLAIMED_KEY = 'claimed';
    var SURVEYS_KEY = 'surveys';
    var INITIAL_POINTS = 50;
    var REWARD = 5;              // 每份问卷固定奖励，与首页文案保持一致
    var PUBLISH_COST = 10;       // 发布一份问卷消耗的积分，与 README / 发布页文案一致
    var MAX_QUESTIONS = 10;      // 单份问卷最多题数
    var MAX_OPTIONS = 6;         // 每题最多选项数
    var MAX_TITLE_LEN = 40;
    var MAX_Q_LEN = 100;
    var MAX_OPTION_LEN = 50;
    var CATEGORIES = ['学习', '生活', '调研', '其他'];

    /* ---------------- 内置问卷（演示用，不属于用户发布） ---------------- */
    var SURVEYS = {
        '1': {
            id: '1',
            title: '大学生网购消费习惯调查',
            publisher: '张三',
            category: '生活',
            minutes: 3,
            reward: 5,
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
                    var options = Array.isArray(item.options) ? item.options : [];
                    var clean = [];
                    for (var j = 0; j < options.length; j++) {
                        var opt = String(options[j] == null ? '' : options[j]).trim();
                        if (opt && clean.indexOf(opt) === -1) clean.push(opt);
                    }
                    if (!q) continue;
                    if (clean.length < 2) continue;
                    questions.push({ q: q, options: clean.slice(0, MAX_OPTIONS) });
                }
                if (questions.length === 0) return;

                var minutes = parseInt(s.minutes, 10);
                out.push({
                    id: String(s.id),
                    title: String(s.title),
                    publisher: s.publisher ? String(s.publisher) : '我',
                    category: CATEGORIES.indexOf(s.category) !== -1 ? s.category : '其他',
                    minutes: isNaN(minutes) || minutes < 1 ? 3 : (minutes > 60 ? 60 : minutes),
                    reward: REWARD,
                    createdAt: parseInt(s.createdAt, 10) || 0,
                    mine: true,
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

            out.push({ q: q, options: clean });
        }
        return { questions: out };
    }

    // 发布入口：发布页调用它即可，校验和落库都在这里统一做
    function createSurvey(payload) {
        var data = payload || {};

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

        // 发布要花积分：不足时一份都不写，避免出现“免费问卷”
        var points = readPoints();
        if (points < PUBLISH_COST) {
            return {
                ok: false,
                code: 'POINTS_NOT_ENOUGH',
                error: '积分不足，发布需要 ' + PUBLISH_COST + ' 分，当前只有 ' + points + ' 分'
            };
        }

        var survey = {
            id: makeSurveyId(),
            title: title,
            publisher: publisher,
            category: category,
            minutes: minutes,
            reward: REWARD,          // 奖励固定，忽略调用方传入的 reward，避免刷分
            createdAt: Date.now(),
            mine: true,
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

        renderSurveyList();          // 若发布页没有列表容器，这里自动跳过
        refreshPoints();
        return { ok: true, id: survey.id, points: readPoints() };
    }

    function removeSurvey(id) {
        var key = String(id == null ? '' : id);
        var list = readSurveys();
        var next = list.filter(function (s) { return String(s.id) !== key; });
        if (next.length === list.length) return false; // 不存在或不是用户发布的

        if (!writeSurveys(next)) return false;
        renderSurveyList();
        return true;
    }

    function getMySurveys() {
        return readSurveys();
    }

    // “我填写过的问卷”：按 claimed 顺序返回 id / 标题 / 奖励，供个人中心列表使用
    function getClaimedSurveys() {
        return readClaimed().map(function (id) {
            var survey = getSurveyById(id);
            return {
                id: id,
                title: survey ? survey.title : '问卷已删除',
                reward: survey ? surveyReward(survey) : REWARD,
                exists: !!survey
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
        return '发布者: ' + survey.publisher +
            ' · 预计耗时: ' + surveyMinutes(survey) + ' 分钟' +
            ' · 共 ' + survey.questions.length + ' 题';
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
        if (!currentSurvey()) {
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
        updateClaimButtonState(); // 未领取时按答题进度控制灰/绿
    }

    function syncAll() {
        refreshPoints();
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

        var html = '';
        survey.questions.forEach(function (item, qi) {
            var name = 'q' + (qi + 1);
            html += '<div class="mb-3">';
            html += '<p class="fw-semibold mb-2">' + (qi + 1) + '. ' + esc(item.q) + '</p>';
            item.options.forEach(function (opt, oi) {
                var id = name + '_' + oi;
                html += '<div class="form-check">';
                html += '<input class="form-check-input" type="radio" name="' + name +
                    '" id="' + id + '" value="' + oi + '">';
                html += '<label class="form-check-label" for="' + id + '">' + esc(opt) + '</label>';
                html += '</div>';
            });
            html += '</div>';
        });
        body.innerHTML = html;
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

    // 逐题检查，给所有未答题的题块加红框，返回是否全部答完
    function validateAnswers() {
        var body = document.getElementById('q-body');
        var survey = currentSurvey();
        if (!body || !survey) return false;

        var missing = [];

        survey.questions.forEach(function (item, qi) {
            var name = 'q' + (qi + 1);
            var input = body.querySelector('input[name="' + name + '"]');
            var block = input ? input.closest('.mb-3') : null;
            if (!block) return;

            if (body.querySelector('input[name="' + name + '"]:checked')) {
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

    // 选中某题后立刻消掉该题的红框
    function onAnswerChange(e) {
        var target = e.target;
        if (!target || !target.name || !/^q\d+$/.test(target.name)) return;
        var input = document.querySelector('input[name="' + target.name + '"]');
        if (input) clearMissing(input.closest('.mb-3'));
        updateClaimButtonState(); // 答完最后一题 → 按钮自动变绿可点
    }

    // 按“还剩几题没答”切换提交按钮：灰=不可点，绿=可领取
    function updateClaimButtonState() {
        var btn = document.getElementById('claim-btn');
        var body = document.getElementById('q-body');
        var survey = currentSurvey();
        if (!btn || !body || !survey || isClaimed(getQid())) return;

        var left = 0;
        survey.questions.forEach(function (item, qi) {
            if (!body.querySelector('input[name="q' + (qi + 1) + '"]:checked')) left++;
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

    /* ---------------- 业务：领取积分 ---------------- */
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

        // 未答完不放行：不加分、不写 claimed
        if (!validateAnswers()) return false;

        // 记录领取 + 加积分：两处写入都要确认成功，失败就回滚，避免刷分或少加分
        claimed.push(qid);
        if (!writeClaimed(claimed)) {
            window.alert('本地存储不可用，领取记录没有保存，请检查浏览器设置');
            return false;
        }
        var nextPoints = readPoints() + surveyReward(survey);
        if (!writePoints(nextPoints)) {
            writeClaimed(claimed.filter(function (id) { return id !== qid; }));
            window.alert('积分保存失败，请重试');
            return false;
        }
        refreshPoints();

        if (btn) markDone(btn);

        var tip = document.getElementById('tip');
        if (tip) {
            tip.textContent = '积分 +' + surveyReward(survey) + ' 成功！当前共 ' + readPoints() + ' 分';
            tip.style.display = 'block';
        }
        return true;
    }

    /* ---------------- 一键重置演示数据 ---------------- */
    // 只清积分和领取记录，保留用户发布的问卷，避免演示到一半把作品清空
    function resetDemoData() {
        if (!window.confirm('确定要清空记录并恢复初始状态吗？')) return false;

        lsSet(POINTS_KEY, String(INITIAL_POINTS));
        lsSet(CLAIMED_KEY, '[]');
        window.location.reload();
        return true;
    }

    /* ---------------- 初始化 ---------------- */
    function init() {
        readPoints();      // 首次进入写入初始 50
        refreshPoints();
        renderDetail();    // 仅详情页生效
        var body = document.getElementById('q-body');
        if (body) body.addEventListener('change', onAnswerChange);
        syncAll();         // 首页列表 / 详情按钮按领取状态置灰
    }

    // 暴露给 HTML 的 onclick
    window.claimPoints = claimPoints;
    window.resetDemoData = resetDemoData;

    // 发布页与其他页面统一走这个接口
    window.SurveyStore = {
        create: createSurvey,
        remove: removeSurvey,
        get: getSurveyById,
        list: getAllSurveys,
        mine: getMySurveys,
        history: getClaimedSurveys,
        categories: CATEGORIES.slice(),
        reward: REWARD,
        publishCost: PUBLISH_COST
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init(); // 脚本被动态注入或加载较晚时也能立即执行
    }

    // 跨标签页同步：发布页写入后，已打开的首页会自动刷新出新卡片
    window.addEventListener('storage', function (e) {
        if (e.key === null || e.key === POINTS_KEY ||
            e.key === CLAIMED_KEY || e.key === SURVEYS_KEY) {
            syncAll();
        }
    });

    // 从详情页返回（含浏览器前进/后退）时重新同步
    window.addEventListener('pageshow', function () {
        syncAll();
    });
})();
