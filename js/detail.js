/* 问卷详情页 · 只读展示 + 答题领取积分 */
(function () {
  'use strict';

  var Store = window.SurveyStore;
  var root = document.getElementById('detail-root');
  if (!Store || !root) return;

  var surveyId = new URLSearchParams(window.location.search).get('id');

  function letter(index) {
    return String.fromCharCode(65 + index);
  }

  function formatAnswer(question) {
    if (!question.answer || !question.answer.length) return '';
    return question.answer.map(function (index) {
      return letter(index) + '. ' + question.options[index];
    }).join('；');
  }

  function renderMissing() {
    document.title = '问卷不存在 - 问卷互助';
    root.textContent = '';
    var box = document.createElement('div');
    box.className = 'detail-empty';

    var heading = document.createElement('h1');
    heading.textContent = '问卷不存在';

    var hint = document.createElement('p');
    hint.textContent = '链接无效，或这份问卷已被发布者删除。';

    var home = document.createElement('a');
    home.className = 'btn btn-outline-primary';
    home.href = 'index.html';
    home.textContent = '返回首页';

    var disabled = document.createElement('button');
    disabled.type = 'button';
    disabled.className = 'btn btn-secondary';
    disabled.disabled = true;
    disabled.textContent = '问卷不可用';

    box.appendChild(heading);
    box.appendChild(hint);
    box.appendChild(home);
    box.appendChild(disabled);
    root.appendChild(box);
  }

  function renderQuestionBlock(question, index, interactive, revealAnswers) {
    var block = document.createElement('section');
    block.className = 'answer-block';
    block.dataset.questionIndex = String(index);
    block.setAttribute('role', 'group');
    block.setAttribute('aria-labelledby', 'detail-q-title-' + index);

    var head = document.createElement('div');
    head.className = 'answer-block__head';

    var heading = document.createElement('h2');
    heading.className = 'answer-block__no';
    heading.id = 'detail-q-title-' + index;
    heading.textContent = '第 ' + (index + 1) + ' 题';

    var type = document.createElement('span');
    type.className = 'type-pill';
    type.textContent = question.type === 'multiple' ? '多选' : '单选';

    head.appendChild(heading);
    head.appendChild(type);
    block.appendChild(head);

    var text = document.createElement('p');
    text.className = 'answer-question';
    text.textContent = question.q;
    block.appendChild(text);

    var options = document.createElement('div');
    options.className = 'answer-options';

    for (var i = 0; i < question.options.length; i++) {
      if (interactive) {
        var label = document.createElement('label');
        label.className = 'form-check';

        var input = document.createElement('input');
        input.className = 'form-check-input';
        input.type = question.type === 'multiple' ? 'checkbox' : 'radio';
        input.name = 'q-' + index;
        input.value = String(i);
        input.id = 'detail-q-' + index + '-o-' + i;

        var labelText = document.createElement('span');
        labelText.className = 'form-check-label';
        labelText.textContent = letter(i) + '. ' + question.options[i];

        label.appendChild(input);
        label.appendChild(labelText);
        options.appendChild(label);
      } else {
        var row = document.createElement('div');
        row.className = 'option-static';
        if (revealAnswers && question.answer && question.answer.indexOf(i) !== -1) {
          row.classList.add('is-correct');
        }

        var letterNode = document.createElement('span');
        letterNode.className = 'option-static__letter';
        letterNode.textContent = letter(i) + '.';

        var optionText = document.createElement('span');
        optionText.textContent = question.options[i];

        row.appendChild(letterNode);
        row.appendChild(optionText);
        options.appendChild(row);
      }
    }

    block.appendChild(options);

    if (revealAnswers) {
      var reveal = document.createElement('p');
      reveal.className = 'answer-reveal';
      var answerText = formatAnswer(question);
      if (answerText) {
        reveal.textContent = '参考答案：' + answerText;
      } else {
        reveal.classList.add('is-empty');
        reveal.textContent = '这份问卷没有设置参考答案。';
      }
      block.appendChild(reveal);
    }

    return block;
  }

  function makeNotice(kind, text) {
    var notice = document.createElement('p');
    notice.className = 'notice notice-' + kind;
    notice.textContent = text;
    return notice;
  }

  function render() {
    var survey = surveyId ? Store.get(surveyId) : null;
    if (!survey) {
      renderMissing();
      return;
    }

    document.title = survey.title + ' - 问卷互助';
    var claimed = Store.isClaimed(survey.id);
    var mine = survey.mine;
    var interactive = !mine && !claimed;
    var revealAnswers = mine || claimed;

    root.textContent = '';

    var card = document.createElement('article');
    card.className = 'detail-card';

    var titleRow = document.createElement('div');
    titleRow.className = 'detail-title-row';

    var title = document.createElement('h1');
    title.className = 'detail-title';
    title.textContent = survey.title;

    var lock = document.createElement('span');
    lock.className = 'lock-pill';
    lock.textContent = '🔒 已锁定';
    lock.title = '问卷已锁定：发布者可修改，填写者无权更改';

    titleRow.appendChild(title);
    titleRow.appendChild(lock);
    card.appendChild(titleRow);

    var meta = document.createElement('p');
    meta.className = 'detail-meta';
    meta.textContent =
      '发布者: ' + survey.publisher +
      ' | 预计耗时: ' + survey.minutes + '分钟' +
      ' | 共 ' + survey.questions.length + ' 题';

    var category = document.createElement('span');
    category.className = 'category-pill';
    category.textContent = survey.category;
    meta.appendChild(document.createTextNode(' '));
    meta.appendChild(category);
    card.appendChild(meta);

    if (survey.cover) {
      var cover = document.createElement('img');
      cover.className = 'survey-cover';
      cover.src = survey.cover;
      cover.alt = survey.title + ' 的封面素材';
      card.appendChild(cover);
    }

    var lockNote = document.createElement('p');
    lockNote.className = 'lock-note';
    lockNote.textContent = mine
      ? '本问卷已锁定：你是发布者，可以修改题目；参与填写者无权更改。'
      : '本问卷已锁定：填写者无权修改题目，只有发布者可以调整。';
    card.appendChild(lockNote);

    if (mine) {
      card.appendChild(makeNotice('info', '这是你发布的问卷，当前为发布者预览。'));
    }

    if (claimed) {
      card.appendChild(makeNotice('success', '你已完成填写，获得 ' + survey.reward + ' 积分。'));
    }

    var sheet = document.createElement(interactive ? 'form' : 'div');
    sheet.className = 'answer-sheet';
    if (interactive) {
      sheet.id = 'answer-form';
      sheet.noValidate = true;
    }

    for (var i = 0; i < survey.questions.length; i++) {
      sheet.appendChild(renderQuestionBlock(survey.questions[i], i, interactive, revealAnswers));
    }

    if (interactive) {
      var error = document.createElement('div');
      error.className = 'notice notice-error d-none';
      error.id = 'detail-form-error';
      error.setAttribute('role', 'alert');

      var submit = document.createElement('button');
      submit.type = 'submit';
      submit.className = 'btn btn-primary answer-submit';
      submit.textContent = '提交并领取 ' + survey.reward + ' 积分';

      sheet.appendChild(error);
      sheet.appendChild(submit);

      sheet.addEventListener('submit', function (event) {
        event.preventDefault();
        error.classList.add('d-none');

        var blocks = sheet.querySelectorAll('.answer-block');
        for (var index = 0; index < blocks.length; index++) {
          blocks[index].classList.remove('is-missing');
        }

        var missing = -1;
        for (var q = 0; q < survey.questions.length; q++) {
          var checked = sheet.querySelector('input[name="q-' + q + '"]:checked');
          if (!checked) {
            missing = q;
            break;
          }
        }

        if (missing !== -1) {
          var missingBlock = sheet.querySelector('.answer-block[data-question-index="' + missing + '"]');
          if (missingBlock) {
            missingBlock.classList.add('is-missing');
            missingBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
            var firstInput = missingBlock.querySelector('input');
            if (firstInput) firstInput.focus({ preventScroll: true });
          }
          error.textContent = '请答完所有题目后再领取积分（第 ' + (missing + 1) + ' 题尚未作答）。';
          error.classList.remove('d-none');
          error.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }

        submit.disabled = true;
        var result = Store.claimPoints(survey.id);
        if (result === false) {
          submit.disabled = false;
          if (Store.isClaimed(survey.id)) {
            render();
            return;
          }
          error.textContent = '领取失败，请稍后重试。';
          error.classList.remove('d-none');
          return;
        }

        render();
      });
    } else if (claimed) {
      var done = document.createElement('button');
      done.type = 'button';
      done.className = 'btn btn-secondary claim-done-btn';
      done.disabled = true;
      done.textContent = '已完成填写';
      sheet.appendChild(done);
    }

    card.appendChild(sheet);

    if (mine) {
      var actions = document.createElement('div');
      actions.className = 'detail-actions';

      var edit = document.createElement('a');
      edit.className = 'btn btn-primary';
      edit.href = 'publish.html?edit=' + encodeURIComponent(survey.id);
      edit.textContent = '编辑问卷';

      var back = document.createElement('a');
      back.className = 'btn btn-outline-secondary';
      back.href = 'index.html';
      back.textContent = '返回首页';

      actions.appendChild(edit);
      actions.appendChild(back);
      card.appendChild(actions);
    }

    root.appendChild(card);
  }

  document.addEventListener('surveystore:change', render);
  render();
})();
