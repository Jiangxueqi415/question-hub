/* ============================================================
 * 校园问卷互助积分平台 · 核心逻辑（原生 JS）
 * localStorage:
 *   points  当前积分，初始 50
 *   claimed 已领取的问卷 id 数组，例如 ["1","2"]
 * ============================================================ */
(function () {
    'use strict';

    var POINTS_KEY = 'points';
    var CLAIMED_KEY = 'claimed';
    var INITIAL_POINTS = 50;
    var REWARD = 5; // 与首页卡片上的“赚 5 积分”保持一致

    /* ---------------- 问卷数据（按 URL 的 id 取） ---------------- */
    var SURVEYS = {
        '1': {
            title: '大学生网购消费习惯调查',
            meta: '发布者: 张三 · 预计耗时: 3 分钟 · 共 4 题',
            questions: [
                { q: '你平均每月网购几次？', options: ['1-2 次', '3-5 次', '6-10 次', '10 次以上'] },
                { q: '你常用的购物平台是？', options: ['淘宝 / 天猫', '京东', '拼多多', '抖音 / 快手'] },
                { q: '你单次网购的平均金额是？', options: ['50 元以内', '50-200 元', '200-500 元', '500 元以上'] },
                { q: '影响你下单的主要因素是？', options: ['价格优惠', '商品评价', '物流速度', '品牌口碑'] }
            ]
        },
        '2': {
            title: '关于校园食堂满意度的调研',
            meta: '发布者: 李四 · 预计耗时: 2 分钟 · 共 4 题',
            questions: [
                { q: '你每周在食堂就餐几次？', options: ['1-3 次', '4-6 次', '7-10 次', '10 次以上'] },
                { q: '你对食堂菜品的口味满意吗？', options: ['非常满意', '比较满意', '一般', '不满意'] },
                { q: '你认为食堂的价格如何？', options: ['很便宜', '比较合理', '偏贵', '太贵'] },
                { q: '你最希望食堂改进什么？', options: ['口味', '价格', '卫生', '排队效率'] }
            ]
        }
    };

    /* ---------------- localStorage 读写 ---------------- */
    function readPoints() {
        var n = parseInt(localStorage.getItem(POINTS_KEY), 10);
        if (isNaN(n)) {
            n = INITIAL_POINTS;
            localStorage.setItem(POINTS_KEY, String(n));
        }
        return n;
    }

    function writePoints(n) {
        localStorage.setItem(POINTS_KEY, String(n));
    }

    // 数据被手动改坏时不抛错，返回空数组，避免整个页面 JS 卡死
    function readClaimed() {
        try {
            var arr = JSON.parse(localStorage.getItem(CLAIMED_KEY) || '[]');
            return Array.isArray(arr) ? arr.map(String) : [];
        } catch (err) {
            return [];
        }
    }

    function writeClaimed(arr) {
        localStorage.setItem(CLAIMED_KEY, JSON.stringify(arr));
    }

    function isClaimed(id) {
        return readClaimed().indexOf(String(id)) !== -1;
    }

    function getQid() {
        return new URLSearchParams(window.location.search).get('id') || '1';
    }

    /* ---------------- 视图同步 ---------------- */
    function refreshPoints() {
        var pts = readPoints();
        document.querySelectorAll('[data-points]').forEach(function (el) {
            el.textContent = pts;
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

    // 根据 claimed 同步首页卡片和详情页按钮
    function syncClaimedUI() {
        document.querySelectorAll('[data-qid]').forEach(function (el) {
            if (isClaimed(el.getAttribute('data-qid'))) markDone(el);
        });

        var btn = document.getElementById('claim-btn');
        if (btn && isClaimed(getQid())) markDone(btn);
    }

    /* ---------------- 详情页渲染 ---------------- */
    function renderDetail() {
        var body = document.getElementById('q-body');
        if (!body) return; // 首页没有这个容器，直接跳过

        var survey = SURVEYS[getQid()] || SURVEYS['1'];
        var title = document.getElementById('q-title');
        var meta = document.getElementById('q-meta');
        if (title) title.textContent = survey.title;
        if (meta) meta.textContent = survey.meta;

        var html = '';
        survey.questions.forEach(function (item, qi) {
            var name = 'q' + (qi + 1);
            html += '<div class="mb-3">';
            html += '<p class="fw-semibold mb-2">' + (qi + 1) + '. ' + item.q + '</p>';
            item.options.forEach(function (opt, oi) {
                var id = name + '_' + oi;
                html += '<div class="form-check">';
                html += '<input class="form-check-input" type="radio" name="' + name + '" id="' + id + '" value="' + oi + '">';
                html += '<label class="form-check-label" for="' + id + '">' + opt + '</label>';
                html += '</div>';
            });
            html += '</div>';
        });
        body.innerHTML = html;
    }

    /* ---------------- 业务：领取积分 ---------------- */
    function claimPoints() {
        var qid = getQid();
        var claimed = readClaimed();
        var btn = document.getElementById('claim-btn');

        // 防重复：已领过不加分，按钮保持灰色
        if (claimed.indexOf(qid) !== -1) {
            if (btn) markDone(btn);
            return false;
        }

        // 记录领取 + 加积分
        claimed.push(qid);
        writeClaimed(claimed);
        writePoints(readPoints() + REWARD);
        refreshPoints();

        if (btn) markDone(btn);

        var tip = document.getElementById('tip');
        if (tip) {
            tip.textContent = '积分 +' + REWARD + ' 成功！当前共 ' + readPoints() + ' 分';
            tip.style.display = 'block';
        }
        return true;
    }

    /* ---------------- 初始化 ---------------- */
    function init() {
        readPoints();      // 首次进入写入初始 50
        refreshPoints();
        renderDetail();    // 仅详情页生效
        syncClaimedUI();   // 首页卡片 / 详情按钮按领取状态置灰
    }

    // 暴露给 HTML 的 onclick="claimPoints()"
    window.claimPoints = claimPoints;

    document.addEventListener('DOMContentLoaded', init);

    // 跨标签页同步
    window.addEventListener('storage', function (e) {
        if (e.key === null || e.key === POINTS_KEY || e.key === CLAIMED_KEY) {
            refreshPoints();
            syncClaimedUI();
        }
    });

    // 从详情页返回（含浏览器前进/后退）时重新同步
    window.addEventListener('pageshow', function () {
        refreshPoints();
        syncClaimedUI();
    });
})();
