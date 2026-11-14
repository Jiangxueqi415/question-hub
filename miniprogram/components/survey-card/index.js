const format = require('../../utils/format');

Component({
  properties: {
    survey: {
      type: Object,
      value: {}
    }
  },

  data: {
    deadlineText: ''
  },

  observers: {
    survey(survey) {
      this.syncDeadline(survey);
    }
  },

  lifetimes: {
    attached() {
      this.syncDeadline(this.data.survey);
    }
  },

  methods: {
    syncDeadline(survey) {
      const data = survey || {};
      this.setData({
        deadlineText: data.endAt ? format.formatShort(data.endAt) + ' 截止' : ''
      });
    },

    onTap() {
      this.triggerEvent('select', { id: this.data.survey && this.data.survey.id });
    }
  }
});
