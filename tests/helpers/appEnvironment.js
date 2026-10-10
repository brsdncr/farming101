function createElement() {
  return {
    style: {},
    dataset: {},
    disabled: false,
    value: '',
    children: [],
    renderCount: 0,
    set innerHTML(value) {
      this._innerHTML = value;
      this.renderCount += 1;
    },
    get innerHTML() {
      return this._innerHTML ?? '';
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener() {},
    closest() { return null; },
    getContext() {
      return {
        imageSmoothingEnabled: false,
        fillRect() {},
        fillText() {},
        drawImage() {},
        clearRect() {},
        beginPath() {},
        arc() {},
        fill() {},
        stroke() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        setTransform() {},
        save() {},
        restore() {},
        measureText() { return { width: 0 }; },
        translate() {},
        scale() {},
        rotate() {},
      };
    },
  };
}

const appElement = createElement();

globalThis.document = {
  getElementById(id) {
    return id === 'app' ? appElement : null;
  },
  createElement,
  querySelector() { return null; },
  addEventListener() {},
};

const app = await import('../../app.js');

export { app, appElement };
