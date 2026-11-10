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
    var TITLE_INPUT_MAX = 20;

    var editId = new URLSearchParams(window.location.search).get('edit');
    var editingSurvey = editId ? Store.get(editId) : null;
    if (editingSurvey && !editingSurvey.mine) editingSurvey = null;
    var isEditing = !!editingSurvey;
    var editUnavailable = !!editId && !editingSurvey;

    var heading = document.getElementById('page-heading');
    var editBanner = document.getElementById('edit-banner');
    var titleInput = document.getElementById('title');
    var titleCount = document.getElementById('title-count');
    var publisherInput = document.getElementById('publisher');
    var countInput = document.getElementById('question-count');
    var minutesInput = document.getElementById('minutes');
    var categorySelect = document.getElementById('category');
    var questionsBox = document.getElementById('questions');
    var addQuestionBtn = document.getElementById('add-question');
    var limitHint = document.getElementById('question-limit-hint');
    var resetBtn = document.getElementById('reset-form');
    var submitBtn = document.getElementById('publish-submit');
    var errorBox = document.getElementById('form-error');
    var pointsHint = document.getElementById('points-hint');
    var materialInput = document.getElementById('material');
    var previewBox = document.getElementById('material-preview');
    var previewImg = document.getElementById('material-preview-img');
    var removeMaterialBtn = document.getElementById('remove-material');
    var questionTemplate = document.getElementById('question-template');
    var optionTemplate = document.getElementById('option-template');
    var coverData = isEditing ? editingSurvey.cover || '' : '';

    function defaultPublisher() {
        var list = Store.mine();
        return list.length ? list[0].publisher : '我';
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

    function letter(index) {
        return String.fromCharCode(65 + index);
    }

    function formatAnswer(answer) {
        if (!Array.isArray(answer)) return '';
        return answer.map(function (index) {
            return letter(index);
        }).join(',');
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
            row.querySelector('.option-letter').textContent = letter(i);
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
        var answerInput = card.querySelector('.answer-input');
        var addOptionBtn = card.querySelector('.add-option');

        questionInput.setAttribute('aria-label', '题目内容');
        answerInput.setAttribute('aria-label', '正确答案');

        if (data) {
            questionInput.value = data.q || '';
            typeSelect.value = data.type === 'multiple' ? 'multiple' : 'single';
            answerInput.value = formatAnswer(data.answer);
        }

        function applyAnswerPlaceholder() {
            answerInput.placeholder = typeSelect.value === 'multiple'
                ? '如：A,C（可填多个）'
                : '如：A（只能填 1 个）';
        }

        typeSelect.addEventListener('change', applyAnswerPlaceholder);
        applyAnswerPlaceholder();

        var initialOptions = data && Array.isArray(data.options) && data.options.length
            ? data.options
            : ['', ''];
        for (var i = 0; i < Math.min(initialOptions.length, OPTIONS_MAX); i++) {
            addOptionRow(card, initialOptions[i]);
        }
        while (card.querySelectorAll('.option-row').length < OPTIONS_MIN) {
            addOptionRow(card, '');
        }

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
                        resolve(dataUrl.length > 450000 ? '' : dataUrl);
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
            var rows = card.querySelectorAll('.option-row');
            var options = [];
            for (var j = 0; j < rows.length; j++) {
                options.push(rows[j].querySelector('.option-input').value.trim());
            }
            questions.push({
                q: card.querySelector('.question-text').value.trim(),
                type: card.querySelector('.question-type').value,
                options: options,
                answer: card.querySelector('.answer-input').value.trim()
            });
        }
        return questions;
    }

    function findBlankOption(questions) {
        for (var i = 0; i < questions.length; i++) {
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
            publisher: publisherInput.value.trim(),
            category: categorySelect.value,
            minutes: minutesInput.value,
            questions: collectQuestions(),
            cover: coverData
        };
    }

    /* ---------------- 编辑模式数据填充 ---------------- */

    function populateForm(survey) {
        hideError();
        titleInput.value = survey.title;
        updateTitleCount();
        publisherInput.value = survey.publisher;
        categorySelect.value = survey.category;
        minutesInput.value = String(survey.minutes);
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
        publisherInput.value = defaultPublisher();
        categorySelect.value = '其他';
        minutesInput.value = '3';
        materialInput.value = '';

        questionsBox.textContent = '';
        questionsBox.appendChild(createQuestionCard());
        renumberQuestions();
        setCover('');
        titleInput.focus();
    }

    /* ---------------- 提交状态 ---------------- */

    function syncPointsState() {
        if (isEditing) return;
        var enough = Store.points >= Store.publishCost;
        submitBtn.disabled = !enough;
        if (enough) {
            pointsHint.classList.add('d-none');
            pointsHint.textContent = '';
        } else {
            pointsHint.classList.remove('d-none');
            pointsHint.textContent =
                '积分不足，发布需要 ' + Store.publishCost + ' 积分，当前只有 ' +
                Store.points + ' 分。可先去填写问卷赚积分。';
        }
    }

    /* ---------------- 初始化 ---------------- */

    Store.categories.forEach(function (category) {
        var option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
    });
    categorySelect.value = '其他';

    titleInput.addEventListener('input', updateTitleCount);

    if (isEditing) {
        heading.textContent = '编辑问卷';
        document.title = '编辑问卷 - 问卷互助';
        editBanner.classList.remove('d-none');
        editBanner.textContent =
            '正在编辑《' + editingSurvey.title + '》：问卷已锁定，发布者可修改题目，填写者无权更改。保存不扣除积分。';
        submitBtn.textContent = '保存修改';
        populateForm(editingSurvey);
    } else {
        publisherInput.value = defaultPublisher();
        minutesInput.value = '3';
        questionsBox.appendChild(createQuestionCard());
        renumberQuestions();
        submitBtn.textContent = '消耗 ' + Store.publishCost + ' 积分发布问卷';
    }

    if (editUnavailable) {
        heading.textContent = '编辑问卷';
        document.title = '编辑问卷 - 问卷互助';
        editBanner.className = 'alert alert-danger';
        editBanner.classList.remove('d-none');
        editBanner.textContent = '未找到可编辑的问卷，只有发布者可以修改已发布的问卷。请返回首页重新进入。';
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

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        hideError();

        if (editUnavailable) return;

        var titleLength = titleInput.value.trim().length;
        if (titleLength > TITLE_INPUT_MAX) {
            showError('标题最多 ' + TITLE_INPUT_MAX + ' 个字');
            titleInput.focus();
            return;
        }

        if (!isEditing && Store.points < Store.publishCost) {
            showError(
                '积分不足，发布需要 ' + Store.publishCost + ' 积分，当前只有 ' + Store.points + ' 分'
            );
            return;
        }

        var payload = collectPayload();
        var blankOption = findBlankOption(payload.questions);
        if (blankOption) {
            showError(blankOption);
            return;
        }

        var result = isEditing
            ? Store.update(editingSurvey.id, payload)
            : Store.create(payload);

        if (!result.ok) {
            showError(result.error);
            return;
        }

        if (isEditing) {
            window.alert('保存成功');
            window.location.href = 'detail.html?id=' + encodeURIComponent(editingSurvey.id);
        } else {
            window.alert('发布成功');
            window.location.href = 'index.html';
        }
    });

    syncPointsState();
})();
