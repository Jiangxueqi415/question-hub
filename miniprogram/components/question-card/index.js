const constants = require('../../utils/constants');

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

Component({
  properties: {
    question: {
      type: Object,
      value: {}
    },
    index: {
      type: Number,
      value: 0
    },
    value: {
      type: null,
      value: null
    },
    readonly: {
      type: Boolean,
      value: false
    }
  },

  data: {
    optionViews: [],
    openText: '',
    typeLabel: '',
    answered: false
  },

  observers: {
    'question, value, readonly'(question, value) {
      this.sync(question, value);
    }
  },

  lifetimes: {
    attached() {
      this.sync(this.data.question, this.data.value);
    }
  },

  methods: {
    sync(question, value) {
      const data = question || {};
      const options = Array.isArray(data.options) ? data.options : [];
      const selectedIndexes = data.type === 'multiple' && Array.isArray(value) ? value : [];

      const optionViews = options.map(function (option, index) {
        return {
          id: option.id || index,
          text: option.text,
          letter: LETTERS[index] || '',
          selected:
            data.type === 'multiple' ? selectedIndexes.indexOf(index) !== -1 : value === index
        };
      });

      let answered = false;
      if (data.type === 'single') {
        answered = typeof value === 'number';
      } else if (data.type === 'multiple') {
        answered = Array.isArray(value) && value.length > 0;
      } else {
        answered = typeof value === 'string' && value.trim().length > 0;
      }

      let typeLabel = '单选';
      for (let i = 0; i < constants.QUESTION_TYPES.length; i += 1) {
        if (constants.QUESTION_TYPES[i].value === data.type) {
          typeLabel = constants.QUESTION_TYPES[i].label;
          break;
        }
      }

      const openText = typeof value === 'string' ? value : '';
      const patch = {
        optionViews: optionViews,
        typeLabel: typeLabel,
        answered: answered
      };
      // 输入过程中避免重复回写同一段文本，减少 textarea 光标跳动
      if (this.data.openText !== openText) {
        patch.openText = openText;
      }
      this.setData(patch);    },

    onOptionTap(e) {
      if (this.data.readonly) return;
      const index = Number(e.currentTarget.dataset.index);
      const question = this.data.question || {};

      if (question.type === 'multiple') {
        const current = Array.isArray(this.data.value) ? this.data.value.slice() : [];
        const position = current.indexOf(index);
        if (position >= 0) {
          current.splice(position, 1);
        } else {
          current.push(index);
        }
        current.sort(function (a, b) {
          return a - b;
        });
        this.triggerEvent('change', { index: this.data.index, value: current });
        return;
      }

      this.triggerEvent('change', { index: this.data.index, value: index });
    },

    onOpenInput(e) {
      const value = String((e.detail && e.detail.value) || '').slice(0, constants.OPEN_ANSWER_MAX_LEN);
      this.setData({
        openText: value,
        answered: value.trim().length > 0
      });
      this.triggerEvent('change', { index: this.data.index, value: value });
    }
  }
});
