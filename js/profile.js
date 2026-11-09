/* 个人中心 · 只展示，读写全部通过 SurveyStore */
(function () {
  'use strict';

  var Store = window.SurveyStore;
  var mineBox = document.getElementById('my-surveys');
  var historyBox = document.getElementById('my-history');
  if (!Store || !mineBox || !historyBox) return;

  function addEmpty(container, text) {
    var empty = document.createElement('p');
    empty.className = 'profile-empty';
    empty.textContent = text;
    container.appendChild(empty);
  }

  function createSurveyRow(survey) {
    var row = document.createElement('div');
    row.className = 'profile-row';

    var main = document.createElement('div');
    main.className = 'profile-row__main';

    var title = document.createElement('h3');
    title.className = 'profile-row__title';

    var link = document.createElement('a');
    link.href = 'detail.html?id=' + encodeURIComponent(survey.id);
    link.textContent = survey.title;
    title.appendChild(link);

    var lockPill = document.createElement('span');
    lockPill.className = 'status-pill';
    lockPill.textContent = '已锁定';
    title.appendChild(lockPill);

    var meta = document.createElement('p');
    meta.className = 'profile-row__meta';
    meta.textContent =
      '预计耗时 ' + survey.minutes + ' 分钟 · 共 ' + survey.questions.length + ' 题 · ' +
      survey.category;

    main.appendChild(title);
    main.appendChild(meta);

    var actions = document.createElement('div');
    actions.className = 'profile-row__actions';

    var edit = document.createElement('a');
    edit.className = 'btn btn-sm btn-outline-primary';
    edit.href = 'publish.html?edit=' + encodeURIComponent(survey.id);
    edit.textContent = '编辑';

    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-sm btn-outline-danger';
    remove.textContent = '删除';
    remove.addEventListener('click', function () {
      var confirmed = window.confirm('确定删除《' + survey.title + '》吗？删除后无法恢复。');
      if (!confirmed) return;
      if (!Store.remove(survey.id)) {
        window.alert('删除失败，请稍后重试。');
        return;
      }
      render();
    });

    actions.appendChild(edit);
    actions.appendChild(remove);

    row.appendChild(main);
    row.appendChild(actions);
    return row;
  }

  function renderMine() {
    var list = Store.mine();
    mineBox.textContent = '';

    if (!list.length) {
      addEmpty(mineBox, '还没有发布过问卷，去发布一份试试吧。');
      return;
    }

    for (var i = 0; i < list.length; i++) {
      mineBox.appendChild(createSurveyRow(list[i]));
    }
  }

  function createHistoryRow(item) {
    var row = document.createElement('div');
    row.className = 'profile-row';

    var main = document.createElement('div');
    main.className = 'profile-row__main';

    var title = document.createElement('h3');
    title.className = 'profile-row__title';

    if (item.exists) {
      var link = document.createElement('a');
      link.href = 'detail.html?id=' + encodeURIComponent(item.id);
      link.textContent = item.title;
      title.appendChild(link);

      var done = document.createElement('span');
      done.className = 'status-pill status-pill--muted';
      done.textContent = '已完成';
      title.appendChild(done);
    } else {
      var missing = document.createElement('span');
      missing.className = 'profile-row__missing';
      missing.textContent = '问卷已删除';
      title.appendChild(missing);
    }

    var meta = document.createElement('p');
    meta.className = 'profile-row__meta';
    meta.textContent = item.exists
      ? '已领取 ' + item.reward + ' 积分'
      : '该问卷已被发布者删除，已领取的积分保留。';

    main.appendChild(title);
    main.appendChild(meta);
    row.appendChild(main);
    return row;
  }

  function renderHistory() {
    var list = Store.history();
    historyBox.textContent = '';

    if (!list.length) {
      addEmpty(historyBox, '还没有填写过问卷，去首页找一份问卷填写吧。');
      return;
    }

    for (var i = 0; i < list.length; i++) {
      historyBox.appendChild(createHistoryRow(list[i]));
    }
  }

  function render() {
    renderMine();
    renderHistory();
  }

  document.addEventListener('surveystore:change', render);
  render();
})();
