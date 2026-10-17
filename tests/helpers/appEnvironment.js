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

// render() restores the shop's scroll position on the next frame.
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);

// In-memory stand-in for the browser's localStorage, used by the save system.
const storedItems = new Map();
globalThis.localStorage = {
  getItem: (key) => (storedItems.has(key) ? storedItems.get(key) : null),
  setItem: (key, value) => storedItems.set(key, String(value)),
  removeItem: (key) => storedItems.delete(key),
  clear: () => storedItems.clear(),
};

const app = await import('../../app.js');

// The app boots into the main menu; most tests exercise the farm screen.
app.uiState.screen = 'game';

export { app, appElement };
