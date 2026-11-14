Component({
  properties: {
    startedAt: {
      type: Number,
      value: 0
    }
  },

  data: {
    text: '0 秒'
  },

  observers: {
    startedAt() {
      this.startTimer();
    }
  },

  lifetimes: {
    attached() {
      this.startTimer();
    },
    detached() {
      this.stopTimer();
    }
  },

  methods: {
    startTimer() {
      this.stopTimer();
      const startedAt = Number(this.data.startedAt) || 0;
      if (!startedAt) return;

      const tick = () => {
        const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        this.setData({ text: seconds + ' 秒' });
        this.triggerEvent('tick', { seconds: seconds });
      };

      tick();
      this._timer = setInterval(tick, 1000);
    },

    stopTimer() {
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    }
  }
});
