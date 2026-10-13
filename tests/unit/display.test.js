import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { applyDisplayMode, saveMode, savedMode } = require('../../electron/display.cjs');

// Just enough of Electron's `app` to watch what the display module does.
function fakeApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-display-'));
  const app = {
    dir,
    switches: {},
    hardwareOff: false,
    listeners: {},
    getPath: () => dir,
    commandLine: { appendSwitch: (name, value) => (app.switches[name] = value) },
    disableHardwareAcceleration: () => (app.hardwareOff = true),
    on: (name, fn) => (app.listeners[name] = fn),
  };
  return app;
}

function withEnv(env, fn) {
  const old = { CADENCE_WAYLAND: process.env.CADENCE_WAYLAND, CADENCE_X11: process.env.CADENCE_X11 };
  delete process.env.CADENCE_WAYLAND;
  delete process.env.CADENCE_X11;
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(old)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
}

test('display mode: X11 with software drawing by default on Linux', { skip: process.platform !== 'linux' }, () => {
  withEnv({}, () => {
    const app = fakeApp();
    const result = applyDisplayMode(app);
    assert.deepEqual(result, { mode: 'x11', saved: null });
    assert.equal(app.switches['ozone-platform'], 'x11');
    assert.equal(app.hardwareOff, true);
  });
});

test('display mode: a saved Wayland choice skips X11 and keeps the GPU', { skip: process.platform !== 'linux' }, () => {
  withEnv({}, () => {
    const app = fakeApp();
    saveMode(app.dir, 'wayland');
    assert.equal(savedMode(app.dir), 'wayland');
    assert.deepEqual(applyDisplayMode(app), { mode: 'wayland', saved: 'wayland' });
    assert.equal(app.switches['ozone-platform'], undefined);
    assert.equal(app.hardwareOff, false);
    assert.equal(app.listeners['child-process-gone'], undefined);
  });
});

test('display mode: environment variables win for one run', { skip: process.platform !== 'linux' }, () => {
  withEnv({ CADENCE_WAYLAND: '1' }, () => {
    const app = fakeApp();
    assert.equal(applyDisplayMode(app).mode, 'wayland');
    assert.equal(app.switches['ozone-platform'], undefined);
  });
  withEnv({ CADENCE_X11: '1' }, () => {
    const app = fakeApp();
    saveMode(app.dir, 'wayland');
    assert.deepEqual(applyDisplayMode(app), { mode: 'x11', saved: 'wayland' });
    assert.equal(app.switches['ozone-platform'], 'x11');
  });
});

test('display mode: junk in the file is ignored', () => {
  const app = fakeApp();
  fs.writeFileSync(path.join(app.dir, 'display-mode'), 'vulkan\n');
  assert.equal(savedMode(app.dir), null);
  assert.equal(savedMode(path.join(app.dir, 'missing')), null);
});

test('display mode: a graphics crash in X11 mode saves Wayland and restarts once', { skip: process.platform !== 'linux' }, () => {
  withEnv({}, () => {
    const app = fakeApp();
    let restarts = 0;
    const result = applyDisplayMode(app, { onFallback: () => restarts++ });
    const gone = app.listeners['child-process-gone'];
    gone({}, { type: 'Utility', reason: 'crashed' });
    gone({}, { type: 'GPU', reason: 'clean-exit' });
    assert.equal(savedMode(app.dir), null, 'other processes and clean exits change nothing');
    gone({}, { type: 'GPU', reason: 'crashed' });
    gone({}, { type: 'GPU', reason: 'crashed' });
    assert.equal(savedMode(app.dir), 'wayland');
    assert.equal(result.saved, 'wayland');
    assert.equal(restarts, 1);
  });
  // Forced X11 never restarts itself (it would only crash again), but the choice is still saved.
  withEnv({ CADENCE_X11: '1' }, () => {
    const app = fakeApp();
    let restarts = 0;
    applyDisplayMode(app, { onFallback: () => restarts++ });
    app.listeners['child-process-gone']({}, { type: 'GPU', reason: 'crashed' });
    assert.equal(savedMode(app.dir), 'wayland');
    assert.equal(restarts, 0);
  });
});
