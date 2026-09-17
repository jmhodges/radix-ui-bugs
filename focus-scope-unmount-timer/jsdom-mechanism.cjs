// The underlying mechanism, with no Vitest or React involved.
// After the jsdom window is closed and its globals are gone, an element from that document still
// accepts the CustomEvent constructor captured from its own realm, but rejects Node's built-in one.
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>');
const c = dom.window.document.getElementById('c');
const CapturedCustomEvent = dom.window.CustomEvent;
c.remove();
dom.window.close();

try {
  c.dispatchEvent(new CustomEvent('x')); // Node's CustomEvent, what focus-scope ends up using after teardown
  console.log("Node's CustomEvent: ok (unexpected)");
} catch (error) {
  console.log("Node's CustomEvent:", String(error));
}

c.dispatchEvent(new CapturedCustomEvent('x'));
console.log("jsdom's CustomEvent (captured before close): ok");
