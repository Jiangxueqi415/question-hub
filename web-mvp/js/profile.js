/* 个人中心：积分/信誉分由 app.js 刷新，这里只负责发布统计与填写记录 */
(function () {
    'use strict';

    var Store = window.SurveyStore;
    if (!Store) return;

    var UI = window.SurveyStatsUI;

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function formatDateTime(ts) {
        if (!ts) return '—';
        var d = new Date(ts);
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
            ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }

    function windowState(survey) {
        if (!survey.startAt || !survey.endAt) return 'none';
        var now = Date.now();
        if (now < survey.startAt) return 'before';
        if (now > survey.endAt) return 'ended';
        return 'open';
    }

    function statusInfo(survey) {
        var state = windowState(survey);
        if (state === 'before') return { text: '未开始', badge: 'bg-info text-dark' };
        if (state === 'ended') return { text: '已截止', badge: 'bg-secondary' };
        if (state === 'open') return { text: '进行中', badge: 'bg-success' };
        return { text: '不限时', badge: 'bg-light text-secondary border' };
    }

    function typeLabel(type) {
        if (type === 'multiple') return '多选';
        if (type === 'open') return '开放';
        return '单选';
    }

    function responseCount(stats) {
        if (!stats || stats.length === 0) return 0;
        var total = 0;
        stats.forEach(function (stat) {
            if (stat && stat.total > total) total = stat.total;
        });
        return total;
    }

    function statsHtml(survey, stats) {
        if (!stats || stats.length === 0) {
            return '<p class="survey-stat-empty mb-0">暂无作答数据</p>';
        }

        var html = '';
        survey.questions.forEach(function (item, qi) {
            var stat = stats[qi];
            var type = item.type === 'open' ? 'open'
                : (item.type === 'multiple' ? 'multiple' : 'single');

            html += '<div class="profile-stat-question">';
            html += '<div class="fw-semibold mb-1">' + (qi + 1) + '. ' +
                (UI ? UI.esc(item.q) : '') +
                ' <span class="badge bg-light text-secondary border">' + typeLabel(type) + '</span></div>';

            if (!stat) {
                html += '<p class="survey-stat-empty mb-0">暂无作答数据</p>';
            } else if (type === 'open') {
                html += UI ? UI.openBlockHtml(stat)
                    : '<p class="survey-stat-empty mb-0">暂无作答数据</p>';
            } else if (stat.total === 0) {
                html += '<p class="survey-stat-empty mb-0">暂无作答数据</p>';
            } else {
                html += '<div class="small text-muted mb-2">共 ' + stat.total + ' 人作答</div>';
                item.options.forEach(function (opt, oi) {
                    var count = stat.counts[oi] || 0;
                    html += '<div class="profile-stat-option">' +
                        String.fromCharCode(65 + oi) + '. ' + (UI ? UI.esc(opt) : '') +
                        '</div>';
                    html += UI ? UI.optionRowHtml(count, stat.total) : '';
                });
            }

            html += '</div>';
        });
        return html;
    }

    function actionLink(text, href, className) {
        var link = document.createElement('a');
        link.href = href;
        link.className = className;
        link.textContent = text;
        return link;
    }

    function deleteSurvey(survey, onDone) {
        if (!window.confirm('确定删除《' + survey.title + '》吗？删除后统计与作答记录一并清空。')) {
            return;
        }
        if (!Store.remove(survey.id)) {
            window.alert('删除失败，请重试');
            return;
        }
        onDone();
    }

    function renderSurveyCard(survey) {
        var stats = Store.stats(survey.id);
        var count = responseCount(stats);
        var status = statusInfo(survey);

        var card = document.createElement('div');
        card.className = 'card border-0 shadow-sm mb-3 profile-survey-card';

        var body = document.createElement('div');
        body.className = 'card-body';

        var head = document.createElement('div');
        head.className = 'd-flex justify-content-between align-items-start flex-wrap gap-2';

        var info = document.createElement('div');
        info.className = 'me-2';

        var title = document.createElement('h6');
        title.className = 'mb-1';
        title.textContent = survey.title;
        info.appendChild(title);

        var meta = document.createElement('div');
        meta.className = 'small text-muted';
        meta.textContent = '分类：' + survey.category +
            (survey.endAt ? ' · 截止：' + formatDateTime(survey.endAt) : '') +
            ' · 共 ' + count + ' 份作答';
        info.appendChild(meta);

        var badge = document.createElement('span');
        badge.className = 'badge ' + status.badge + ' mt-2';
        badge.textContent = status.text;
        info.appendChild(badge);

        var actions = document.createElement('div');
        actions.className = 'd-flex flex-wrap gap-2';

        var statsBtn = document.createElement('button');
        statsBtn.type = 'button';
        statsBtn.className = 'btn btn-sm btn-outline-primary';
        statsBtn.textContent = '查看统计';
        actions.appendChild(statsBtn);

        actions.appendChild(actionLink('打开问卷', 'detail.html?id=' + encodeURIComponent(survey.id),
            'btn btn-sm btn-outline-secondary'));
        actions.appendChild(actionLink('编辑', 'publish.html?edit=' + encodeURIComponent(survey.id),
            'btn btn-sm btn-outline-secondary'));

        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-sm btn-outline-danger';
        delBtn.textContent = '删除';
        delBtn.addEventListener('click', function () {
            deleteSurvey(survey, renderAll);
        });
        actions.appendChild(delBtn);

        head.appendChild(info);
        head.appendChild(actions);
        body.appendChild(head);

        var statsBox = document.createElement('div');
        statsBox.className = 'profile-stats-box d-none mt-3';
        statsBox.innerHTML = statsHtml(survey, stats);
        body.appendChild(statsBox);

        statsBtn.addEventListener('click', function () {
            var expanded = !statsBox.classList.contains('d-none');
            statsBox.classList.toggle('d-none', expanded);
            statsBtn.textContent = expanded ? '查看统计' : '收起统计';
        });

        card.appendChild(body);
        return card;
    }

    function renderMyPublish() {
        var box = document.getElementById('my-surveys');
        var summary = document.getElementById('my-publish-summary');
        if (!box) return;

        var list = Store.mine();
        var totalResponses = 0;
        list.forEach(function (survey) {
            totalResponses += responseCount(Store.stats(survey.id));
        });

        if (summary) {
            summary.textContent = '共发布 ' + list.length + ' 份 · 收到 ' + totalResponses + ' 份作答';
        }

        box.innerHTML = '';
        if (list.length === 0) {
            box.innerHTML = '<p class="text-muted mb-0">还没有发布过问卷，' +
                '<a href="publish.html">去发布一份</a></p>';
            return;
        }

        list.forEach(function (survey) {
            box.appendChild(renderSurveyCard(survey));
        });
    }

    function renderMyHistory() {
        var box = document.getElementById('my-history');
        if (!box) return;

        var list = Store.history();
        box.innerHTML = '';

        if (list.length === 0) {
            box.innerHTML = '<p class="text-muted mb-0">还没有填写过问卷，' +
                '<a href="index.html">去首页看看</a></p>';
            return;
        }

        list.forEach(function (item) {
            var row = document.createElement('div');
            row.className = 'd-flex justify-content-between align-items-start border-bottom py-2 gap-2';

            var left = document.createElement('div');
            left.className = 'me-2';

            var title = document.createElement('div');
            title.className = 'small' + (item.exists ? '' : ' text-muted');
            title.textContent = item.exists ? item.title : '问卷已删除';
            left.appendChild(title);

            var meta = document.createElement('div');
            meta.className = 'text-muted';
            meta.style.fontSize = '.75rem';
            meta.textContent = '获得 ' + item.reward + ' 积分 · 填写时间：' +
                (item.time ? formatDateTime(item.time) : '—');
            left.appendChild(meta);

            row.appendChild(left);

            if (item.exists) {
                row.appendChild(actionLink('查看', 'detail.html?id=' + encodeURIComponent(item.id),
                    'small text-decoration-none text-nowrap'));
            }

            box.appendChild(row);
        });
    }

    function renderAll() {
        renderMyPublish();
        renderMyHistory();
    }

    // 演示扣分按钮只在 ?demo=1 时显示，避免正式演示误触
    var demoBtn = document.getElementById('demo-btn');
    if (demoBtn) {
        demoBtn.classList.toggle('d-none', window.location.search.indexOf('demo=1') === -1);
    }

    // 多标签页同步：发布 / 作答 / 删除后刷新统计与记录
    window.addEventListener('storage', function (e) {
        if (e.key === null || e.key === 'surveys' || e.key === 'claimed' ||
            e.key === 'responses' || e.key === 'attempts' ||
            e.key === 'points' || e.key === 'credit') {
            renderAll();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderAll);
    } else {
        renderAll();
    }
})();
