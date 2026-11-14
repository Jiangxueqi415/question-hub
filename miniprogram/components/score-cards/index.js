const format = require('../../utils/format');

Component({
  properties: {
    points: {
      type: Number,
      value: 0
    },
    credit: {
      type: Number,
      value: 0
    }
  },

  data: {
    levelName: '较差',
    levelTone: 'poor',
    creditHint: '信誉分 ≥40 可发布'
  },

  observers: {
    credit(credit) {
      this.syncLevel(credit);
    }
  },

  lifetimes: {
    attached() {
      this.syncLevel(this.data.credit);
    }
  },

  methods: {
    syncLevel(credit) {
      const level = format.levelOf(credit);
      this.setData({
        levelName: level.name,
        levelTone: level.tone
      });
    },

    onCreditTap() {
      this.triggerEvent('credit');
    }
  }
});
