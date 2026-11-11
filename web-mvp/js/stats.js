/* 作答统计共用视图：详情页与个人中心使用同一套浅色横条样式 */
(function () {
    'use strict';

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function percent(count, total) {
        if (!total) return 0;
        return Math.round(count / total * 100);
    }

    // 选项下方的小横条：颜色偏浅，末尾显示“人数 · 占比”
    function optionRowHtml(count, total) {
        var pct = percent(count, total);
        return '<div class="survey-stat-row">' +
            '<div class="survey-stat-track">' +
                '<div class="survey-stat-bar" style="width:' + pct + '%"></div>' +
            '</div>' +
            '<span class="survey-stat-value">' + count + ' 人 · ' + pct + '%</span>' +
        '</div>';
    }

    function emptyHtml(text) {
        return '<p class="survey-stat-empty mb-0">' + esc(text || '暂无作答数据') + '</p>';
    }

    // 开放题：发布者可见的文字作答列表
    function openBlockHtml(stat) {
        if (!stat || !stat.answers || stat.answers.length === 0) {
            return emptyHtml('暂无作答数据');
        }

        var html = '<div class="survey-open-stats">' +
            '<div class="survey-stats-title">作答内容（共 ' + stat.answers.length +
                ' 条，仅发布者可见）</div>' +
            '<div class="survey-open-list">';
        stat.answers.forEach(function (text) {
            html += '<div class="survey-open-item">' + esc(text) + '</div>';
        });
        html += '</div></div>';
        return html;
    }

    window.SurveyStatsUI = {
        esc: esc,
        percent: percent,
        optionRowHtml: optionRowHtml,
        emptyHtml: emptyHtml,
        openBlockHtml: openBlockHtml
    };
})();
