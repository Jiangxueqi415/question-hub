/* 发布 / 编辑问卷页 · 只收集表单，校验与落库全部交给 SurveyStore */
(function () {
    'use strict';

    var Store = window.SurveyStore;
    var form = document.getElementById('publish-form');
    if (!Store || !form) return;

    var QUESTIONS_MIN = 1;
    var QUESTIONS_MAX = 10;
    var OPTIONS_MIN = 2;
    var OPTIONS_MAX = 6;
    var MINUTES_MIN = 1;
    var MINUTES_MAX = 60;
    var TITLE_INPUT_MAX = 40;
    var DEFAULT_WINDOW_DAYS = 7;
    var ONE_DAY = 24 * 60 * 60 * 1000;

    // 题目模板提示词：只做 placeholder，输入内容后自然消失，不写入表单
    var QUESTION_TEMPLATES = {
        '学习': [
            '例如：你平时喜欢看什么书？',
            '例如：你每天大约花多长时间自习？',
            '例如：你更喜欢线上还是线下上课？'
        ],
        '生活': [
            '例如：你周末一般怎么安排？',
            '例如：你每月的生活费大概是多少？',
            '例如：你平时更喜欢食堂还是外卖？'
        ],
        '调研': [
            '例如：你选择现在专业的主要原因是什么？',
            '例如：你对学校目前的宿舍条件满意吗？',
            '例如：你通常从哪里获取校园活动信息？'
        ],
        '其他': [
            '例如：你最近在关注什么事情？',
            '例如：你希望学校增加哪类服务？'
        ]
    };

    var editId = new URLSearchParams(window.location.search).get('edit');
    var editingSurvey = editId ? Store.get(editId) : null;
    if (editingSurvey && !editingSurvey.mine) editingSurvey = null;
    var isEditing = !!editingSurvey;
    var editUnavailable = !!editId && !editingSurvey;
    var submitting = false;

    var heading = document.getElementById('page-heading');
    var editBanner = document.getElementById('edit-banner');
    var titleInput = document.getElementById('title');
    var titleCount = document.getElementById('title-count');
    var publisherInput = document.getElementById('publisher');
    var countInput = document.getElementById('question-count');
    var minutesInput = document.getElementById('minutes');
    var categorySelect = document.getElementById('category');
    var startInput = document.getElementById('start-at');
    var endInput = document.getElementById('end-at');
    var ruleHint = document.getElementById('publish-rule-hint');
    var questionsBox = document.getElementById('questions');
    var addQuestionBtn = document.getElementById('add-question');
    var limitHint = document.getElementById('question-limit-hint');
    var resetBtn = document.getElementById('reset-form');
    var submitBtn = document.getElementById('publish-submit');
    var errorBox = document.getElementById('form-error');
    var gateHint = document.getElementById('points-hint');
    var materialInput = document.getElementById('material');
    var previewBox = document.getElementById('material-preview');
    var previewImg = document.getElementById('material-preview-img');
    var removeMaterialBtn = document.getElementById('remove-material');
    var questionTemplate = document.getElementById('question-template');
    var optionTemplate = document.getElementById('option-template');
    var coverData = isEditing ? editingSurvey.cover || '' : '';

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function formatDateTimeValue(ms) {
        var d = new Date(ms);
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
            'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }

    function defaultStartAt() {
        var d = new Date();
        d.setSeconds(0, 0);
        return d.getTime();
    }

    function defaultEndAt() {
        return defaultStartAt() + DEFAULT_WINDOW_DAYS * ONE_DAY;
    }

    function parseDateInput(input) {
        if (!input || !input.value) return NaN;
        var time = new Date(input.value).getTime();
        return isFinite(time) ? time : NaN;
    }

    function updateTitleCount() {
        titleCount.textContent = String(titleInput.value.length);
    }

    function showError(message) {
        errorBox.textContent = message;
        errorBox.classList.remove('d-none');
        errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function hideError() {
        errorBox.textContent = '';
        errorBox.classList.add('d-none');
    }

    function setCover(dataUrl) {
        coverData = dataUrl || '';
        if (coverData) {
            previewImg.src = coverData;
            previewBox.classList.remove('d-none');
            previewBox.classList.add('d-flex');
        } else {
            previewImg.removeAttribute('src');
            previewBox.classList.add('d-none');
            previewBox.classList.remove('d-flex');
        }
    }

    /* ---------------- 题目卡片 ---------------- */

    function refreshOptionState(card) {
        var rows = card.querySelectorAll('.option-row');
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            row.querySelector('.option-letter').textContent = String.fromCharCode(65 + i);
            var removeBtn = row.querySelector('.remove-option');
            removeBtn.disabled = rows.length <= OPTIONS_MIN;
            removeBtn.title = removeBtn.disabled ? '至少保留 2 个选项' : '删除这个选项';
        }
        var addOptionBtn = card.querySelector('.add-option');
        var atLimit = rows.length >= OPTIONS_MAX;
        addOptionBtn.classList.toggle('d-none', atLimit);
        addOptionBtn.disabled = atLimit;
    }

    function addOptionRow(card, value) {
        if (card.querySelectorAll('.option-row').length >= OPTIONS_MAX) return;
        var row = optionTemplate.content.firstElementChild.cloneNode(true);
        var input = row.querySelector('.option-input');
        input.value = value || '';
        input.setAttribute('aria-label', '选项内容');
        row.querySelector('.remove-option').addEventListener('click', function () {
            if (card.querySelectorAll('.option-row').length <= OPTIONS_MIN) return;
            row.remove();
            refreshOptionState(card);
        });
        card.querySelector('.options').appendChild(row);
        refreshOptionState(card);
    }

    function createQuestionCard(data) {
        var card = questionTemplate.content.firstElementChild.cloneNode(true);
        var questionInput = card.querySelector('.question-text');
        var typeSelect = card.querySelector('.question-type');
        var optionsBlock = card.querySelector('.options-block');
        var openHint = card.querySelector('.open-question-hint');
        var addOptionBtn = card.querySelector('.add-option');

        questionInput.setAttribute('aria-label', '题目内容');

        if (data) {
            questionInput.value = data.q || '';
            typeSelect.value = data.type === 'open'
                ? 'open'
                : (data.type === 'multiple' ? 'multiple' : 'single');
        }

        openHint.textContent = '开放题无需设置选项，作答者最多输入 ' +
            Store.openAnswerMax + ' 字。';

        function applyTypeState() {
            var isOpen = typeSelect.value === 'open';
            optionsBlock.classList.toggle('d-none', isOpen);
            openHint.classList.toggle('d-none', !isOpen);
        }

        typeSelect.addEventListener('change', applyTypeState);

        var initialOptions = data && Array.isArray(data.options) && data.options.length
            ? data.options
            : ['', ''];
        for (var i = 0; i < Math.min(initialOptions.length, OPTIONS_MAX); i++) {
            addOptionRow(card, initialOptions[i]);
        }
        while (card.querySelectorAll('.option-row').length < OPTIONS_MIN) {
            addOptionRow(card, '');
        }
        applyTypeState();

        addOptionBtn.addEventListener('click', function () {
            addOptionRow(card, '');
            var inputs = card.querySelectorAll('.option-input');
            if (inputs.length) inputs[inputs.length - 1].focus();
        });

        card.querySelector('.remove-question').addEventListener('click', function () {
            if (questionsBox.children.length <= QUESTIONS_MIN) return;
            card.remove();
            renumberQuestions();
        });

        return card;
    }

    // 分类切换时只改 placeholder，不写入任何值，输入时提示自然消失
    function applyQuestionPlaceholders() {
        var examples = QUESTION_TEMPLATES[categorySelect.value] || QUESTION_TEMPLATES['其他'];
        var inputs = questionsBox.querySelectorAll('.question-text');
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].placeholder = examples[i % examples.length];
        }
    }

    function renumberQuestions() {
        var cards = questionsBox.querySelectorAll('.question-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].querySelector('.question-no').textContent = '第 ' + (i + 1) + ' 题';
            var removeBtn = cards[i].querySelector('.remove-question');
            removeBtn.disabled = cards.length <= QUESTIONS_MIN;
            removeBtn.title = removeBtn.disabled ? '至少保留 1 道题目' : '删除第 ' + (i + 1) + ' 题';
        }

        countInput.value = String(cards.length);
        addQuestionBtn.disabled = cards.length >= QUESTIONS_MAX;
        limitHint.textContent = cards.length >= QUESTIONS_MAX
            ? '已达到上限 ' + QUESTIONS_MAX + ' 道题'
            : '最多 ' + QUESTIONS_MAX + ' 道题';
        applyQuestionPlaceholders();
    }

    function resizeQuestions(count) {
        count = Math.max(QUESTIONS_MIN, Math.min(QUESTIONS_MAX, count));
        while (questionsBox.children.length < count) {
            questionsBox.appendChild(createQuestionCard());
        }
        while (questionsBox.children.length > count) {
            questionsBox.removeChild(questionsBox.lastElementChild);
        }
        renumberQuestions();
    }

    function addQuestion() {
        if (questionsBox.children.length >= QUESTIONS_MAX) return;
        questionsBox.appendChild(createQuestionCard());
        renumberQuestions();
        var added = questionsBox.lastElementChild;
        var input = added.querySelector('.question-text');
        if (input) input.focus();
        added.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /* ---------------- 数字输入（不允许负数） ---------------- */

    function clampIntegerInput(input, fallback, min, max, onChange) {
        input.addEventListener('keydown', function (event) {
            if (event.key === '-' || event.key === '+' || event.key === 'e' || event.key === 'E' || event.key === '.') {
                event.preventDefault();
            }
        });
        input.addEventListener('change', function () {
            var value = parseInt(input.value, 10);
            if (!isFinite(value) || input.value === '') value = fallback;
            if (value < min) value = min;
            if (value > max) value = max;
            input.value = String(value);
            if (onChange) onChange(value);
        });
    }

    /* ---------------- 素材上传 ---------------- */

    function compressImage(file) {
        return new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onload = function () {
                var image = new Image();
                image.onload = function () {
                    try {
                        var maxSide = 960;
                        var width = image.naturalWidth || image.width;
                        var height = image.naturalHeight || image.height;
                        var scale = Math.min(1, maxSide / Math.max(width, height));
                        var targetWidth = Math.max(1, Math.round(width * scale));
                        var targetHeight = Math.max(1, Math.round(height * scale));

                        var canvas = document.createElement('canvas');
                        canvas.width = targetWidth;
                        canvas.height = targetHeight;
                        var context = canvas.getContext('2d');
                        context.fillStyle = '#ffffff';
                        context.fillRect(0, 0, targetWidth, targetHeight);
                        context.drawImage(image, 0, 0, targetWidth, targetHeight);

                        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                        if (dataUrl.length > 380000) {
                            dataUrl = canvas.toDataURL('image/jpeg', 0.65);
                        }
                        // 是否超长交给调用方判断并提示，避免压缩后静默丢封面
                        resolve(dataUrl);
                    } catch (err) {
                        resolve('');
                    }
                };
                image.onerror = function () {
                    resolve('');
                };
                image.src = String(reader.result || '');
            };
            reader.onerror = function () {
                resolve('');
            };
            reader.readAsDataURL(file);
        });
    }

    /* ---------------- 表单收集 ---------------- */

    function collectQuestions() {
        var cards = questionsBox.querySelectorAll('.question-card');
        var questions = [];
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var type = card.querySelector('.question-type').value;
            var options = [];
            if (type !== 'open') {
                var rows = card.querySelectorAll('.option-row');
                for (var j = 0; j < rows.length; j++) {
                    options.push(rows[j].querySelector('.option-input').value.trim());
                }
            }
            questions.push({
                q: card.querySelector('.question-text').value.trim(),
                type: type,
                options: options
            });
        }
        return questions;
    }

    function findBlankOption(questions) {
        for (var i = 0; i < questions.length; i++) {
            if (questions[i].type === 'open') continue;
            for (var j = 0; j < questions[i].options.length; j++) {
                if (!questions[i].options[j]) {
                    return '第 ' + (i + 1) + ' 题第 ' + (j + 1) + ' 个选项不能为空';
                }
            }
        }
        return '';
    }

    function collectPayload() {
        return {
            title: titleInput.value.trim(),
            publisher: Store.getNickname ? Store.getNickname() : '',
            category: categorySelect.value,
            minutes: minutesInput.value,
            startAt: parseDateInput(startInput),
            endAt: parseDateInput(endInput),
            questions: collectQuestions(),
            cover: coverData
        };
    }

    /* ---------------- 编辑模式数据填充 ---------------- */

    function populateForm(survey) {
        hideError();
        titleInput.value = survey.title;
        updateTitleCount();
        publisherInput.value = Store.getNickname ? Store.getNickname() : '';
        categorySelect.value = survey.category;
        minutesInput.value = String(survey.minutes);
        startInput.value = formatDateTimeValue(survey.startAt || defaultStartAt());
        endInput.value = formatDateTimeValue(survey.endAt || defaultEndAt());
        endInput.min = startInput.value;
        materialInput.value = '';

        questionsBox.textContent = '';
        for (var i = 0; i < survey.questions.length; i++) {
            questionsBox.appendChild(createQuestionCard(survey.questions[i]));
        }
        renumberQuestions();
        setCover(survey.cover || '');
    }

    function clearForm() {
        hideError();
        titleInput.value = '';
        updateTitleCount();
        publisherInput.value = Store.getNickname ? Store.getNickname() : '';
        categorySelect.value = '其他';
        minutesInput.value = '3';
        startInput.value = formatDateTimeValue(defaultStartAt());
        endInput.value = formatDateTimeValue(defaultEndAt());
        endInput.min = startInput.value;
        materialInput.value = '';

        questionsBox.textContent = '';
        questionsBox.appendChild(createQuestionCard());
        renumberQuestions();
        setCover('');
        titleInput.focus();
    }

    /* ---------------- 发布门槛 / 提交状态 ---------------- */

    function submitLabel() {
        return isEditing ? '保存修改' : '消耗 ' + Store.publishCost + ' 积分发布问卷';
    }

    function updateRuleHint() {
        if (!ruleHint) return;
        if (isEditing) {
            ruleHint.textContent = '编辑已发布问卷：保存不扣除积分；当前信誉分 ' +
                Store.getCredit() + ' 分。';
            return;
        }
        var user = Store.getUser ? Store.getUser() : null;
        ruleHint.textContent = '当前积分 ' +
            Store.points + ' 分、信誉分 ' + Store.getCredit() + ' 分，发布需信誉分 ≥ ' +
            Store.creditMin + ' 且消耗 ' + Store.publishCost + ' 积分。' +
            (user && !user.onboarded ? ' 首次使用可先在“我的”完成新人任务。' : '');
    }

    // 发布按钮同时校验积分与信誉分：按未满足的条件分别给出提示
    function syncGateState() {
        updateRuleHint();

        if (isEditing) {
            submitBtn.disabled = submitting;
            return;
        }

        var reasons = [];
        if (Store.points < Store.publishCost) {
            reasons.push('您的积分不足，请去参与问答赚取积分');
        }
        if (Store.getCredit() < Store.creditMin) {
            reasons.push('信誉分不足');
        }

        submitBtn.disabled = submitting || reasons.length > 0;

        if (submitting) {
            gateHint.textContent = '';
            gateHint.classList.add('d-none');
            return;
        }
        if (reasons.length > 0) {
            gateHint.textContent = reasons.join('；');
            gateHint.classList.remove('d-none');
            return;
        }

        gateHint.textContent = '';
        gateHint.classList.add('d-none');
    }

    /* ---------------- 初始化 ---------------- */

    Store.categories.forEach(function (category) {
        var option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
    });
    categorySelect.value = '其他';

    publisherInput.value = Store.getNickname ? Store.getNickname() : '';
    publisherInput.readOnly = true;
    titleInput.addEventListener('input', updateTitleCount);
    categorySelect.addEventListener('change', applyQuestionPlaceholders);

    startInput.addEventListener('change', function () {
        endInput.min = startInput.value;
    });

    if (isEditing) {
        heading.textContent = '编辑问卷';
        document.title = '编辑问卷 - 问卷互助';
        editBanner.classList.remove('d-none');
        editBanner.textContent =
            '正在编辑《' + editingSurvey.title + '》：问卷已锁定，保存不扣除积分。';
        submitBtn.textContent = '保存修改';
        populateForm(editingSurvey);
    } else {
        publisherInput.value = Store.getNickname ? Store.getNickname() : '';
        minutesInput.value = '3';
        startInput.value = formatDateTimeValue(defaultStartAt());
        endInput.value = formatDateTimeValue(defaultEndAt());
        endInput.min = startInput.value;
        questionsBox.appendChild(createQuestionCard());
        renumberQuestions();
        submitBtn.textContent = submitLabel();
    }

    if (editUnavailable) {
        heading.textContent = '编辑问卷';
        document.title = '编辑问卷 - 问卷互助';
        editBanner.className = 'alert alert-danger';
        editBanner.classList.remove('d-none');
        editBanner.textContent = '未找到可编辑的问卷，请返回首页重新进入。';
        form.classList.add('d-none');
        return;
    }

    clampIntegerInput(countInput, 1, QUESTIONS_MIN, QUESTIONS_MAX, resizeQuestions);
    clampIntegerInput(minutesInput, 3, MINUTES_MIN, MINUTES_MAX);

    countInput.addEventListener('input', function () {
        if (countInput.value === '') return;
        var value = parseInt(countInput.value, 10);
        if (!isFinite(value)) return;
        if (value < QUESTIONS_MIN) {
            value = QUESTIONS_MIN;
            countInput.value = String(value);
        }
        if (value > QUESTIONS_MAX) {
            value = QUESTIONS_MAX;
            countInput.value = String(value);
        }
        resizeQuestions(value);
    });

    minutesInput.addEventListener('input', function () {
        if (minutesInput.value === '') return;
        var value = parseInt(minutesInput.value, 10);
        if (!isFinite(value)) return;
        if (value < MINUTES_MIN) {
            minutesInput.value = String(MINUTES_MIN);
        } else if (value > MINUTES_MAX) {
            minutesInput.value = String(MINUTES_MAX);
        }
    });

    addQuestionBtn.addEventListener('click', addQuestion);

    materialInput.addEventListener('change', function () {
        var file = materialInput.files && materialInput.files[0];
        if (!file) return;
        hideError();

        if (!file.type || file.type.indexOf('image/') !== 0) {
            showError('请选择图片文件作为问卷素材');
            materialInput.value = '';
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            showError('素材图片不能超过 2MB');
            materialInput.value = '';
            return;
        }

        compressImage(file).then(function (dataUrl) {
            if (!dataUrl) {
                showError('素材图片处理失败，请换一张更小的图片试试');
                materialInput.value = '';
                return;
            }
            if (dataUrl.length > Store.coverMaxLen) {
                showError('图片过大，请换一张或移除封面');
                materialInput.value = '';
                return;
            }
            setCover(dataUrl);
        });
    });

    removeMaterialBtn.addEventListener('click', function () {
        materialInput.value = '';
        setCover('');
    });

    resetBtn.addEventListener('click', function () {
        if (isEditing) {
            populateForm(editingSurvey);
        } else {
            clearForm();
        }
    });

    // 另一个标签页加分 / 扣分后，本页按钮态与提示同步刷新
    window.addEventListener('storage', function (e) {
        if (e.key === null || e.key === 'points' || e.key === 'credit') {
            syncGateState();
        }
    });

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        hideError();

        if (editUnavailable || submitting) return;

        var titleLength = titleInput.value.trim().length;
        if (titleLength > TITLE_INPUT_MAX) {
            showError('标题最多 ' + TITLE_INPUT_MAX + ' 个字');
            titleInput.focus();
            return;
        }

        if (!isEditing) {
            var gateReasons = [];
            if (Store.points < Store.publishCost) {
                gateReasons.push('您的积分不足，请去参与问答赚取积分');
            }
            if (Store.getCredit() < Store.creditMin) {
                gateReasons.push('信誉分不足');
            }
            if (gateReasons.length > 0) {
                showError(gateReasons.join('；'));
                return;
            }
        }

        var startAt = parseDateInput(startInput);
        var endAt = parseDateInput(endInput);
        if (isNaN(startAt) || isNaN(endAt)) {
            showError('请选择问答开始和截至日期');
            (!startInput.value ? startInput : endInput).focus();
            return;
        }
        if (endAt <= startAt) {
            showError('截至日期必须晚于开始日期');
            endInput.focus();
            return;
        }
        if (!isEditing && endAt <= Date.now()) {
            showError('截至日期必须晚于当前时间');
            endInput.focus();
            return;
        }

        var payload = collectPayload();
        var blankOption = findBlankOption(payload.questions);
        if (blankOption) {
            showError(blankOption);
            return;
        }

        // 提交锁：防止连点生成两份问卷、扣两次积分
        submitting = true;
        submitBtn.disabled = true;
        submitBtn.textContent = '提交中…';

        var result;
        try {
            result = isEditing
                ? Store.update(editingSurvey.id, payload)
                : Store.create(payload);
        } catch (err) {
            result = { ok: false, error: '提交失败，请重试' };
        }

        if (!result.ok) {
            submitting = false;
            submitBtn.textContent = submitLabel();
            syncGateState();
            showError(result.error);
            return;
        }

        // 成功直接跳转，不再弹窗；失败分支已在上方恢复按钮
        if (isEditing) {
            window.location.href = 'detail.html?id=' + encodeURIComponent(editingSurvey.id);
        } else {
            window.location.href = 'index.html';
        }
    });

    syncGateState();
})();
