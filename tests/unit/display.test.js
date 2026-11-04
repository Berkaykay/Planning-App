import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { applyDisplayMode, saveMode, savedMode, hasX11Flag, withoutOzoneFlags } = require('../../electron/display.cjs');

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

// Runs `fn` with only these display variables set (an X11 desktop unless `env` says otherwise),
// and with `argv` as the command line.
const DISPLAY_VARS = ['CADENCE_WAYLAND', 'CADENCE_X11', 'CADENCE_X11_RESTARTED', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE'];
function withEnv(env, fn, argv = ['cadence']) {
  const old = Object.fromEntries(DISPLAY_VARS.map((k) => [k, process.env[k]]));
  const oldArgv = process.argv;
  for (const k of DISPLAY_VARS) delete process.env[k];
  Object.assign(process.env, env);
  process.argv = argv;
  try {
    return fn();
  } finally {
    process.argv = oldArgv;
    for (const [k, v] of Object.entries(old)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
}

test('display mode: X11 with software drawing by default on Linux', { skip: process.platform !== 'linux' }, () => {
  withEnv({}, () => {
    const app = fakeApp();
    const result = applyDisplayMode(app);
    assert.deepEqual(result, { mode: 'x11', saved: null, restartForX11: false });
    assert.equal(app.switches['ozone-platform'], 'x11');
    assert.equal(app.hardwareOff, true);
  });
});

test('display mode: a saved Wayland choice skips X11 and keeps the GPU', { skip: process.platform !== 'linux' }, () => {
  withEnv({}, () => {
    const app = fakeApp();
    saveMode(app.dir, 'wayland');
    assert.equal(savedMode(app.dir), 'wayland');
    assert.deepEqual(applyDisplayMode(app), { mode: 'wayland', saved: 'wayland', restartForX11: false });
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
    assert.deepEqual(applyDisplayMode(app), { mode: 'x11', saved: 'wayland', restartForX11: false });
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

// Cadence 1.6.0 / 1.6.1: on a Wayland desktop the appended switch didn't move the main process to X11,
// so no window appeared. X11 mode now asks for a restart with the flag on the command line.
test('display mode: on a Wayland desktop, X11 mode restarts once with --ozone-platform=x11', { skip: process.platform !== 'linux' }, () => {
  withEnv({ WAYLAND_DISPLAY: 'wayland-0', XDG_SESSION_TYPE: 'wayland' }, () => {
    const app = fakeApp();
    assert.deepEqual(applyDisplayMode(app), { mode: 'x11', saved: null, restartForX11: true });
    assert.equal(app.switches['ozone-platform'], undefined, 'nothing is set up in the copy that restarts');
    assert.equal(process.env.CADENCE_X11_RESTARTED, '1');
  });
  // The restarted copy has the flag: it runs in X11 mode and clears the loop guard.
  withEnv({ WAYLAND_DISPLAY: 'wayland-0', CADENCE_X11_RESTARTED: '1' }, () => {
    const app = fakeApp();
    assert.deepEqual(applyDisplayMode(app), { mode: 'x11', saved: null, restartForX11: false });
    assert.equal(app.switches['ozone-platform'], 'x11');
    assert.equal(app.hardwareOff, true);
    assert.equal(process.env.CADENCE_X11_RESTARTED, undefined);
  }, ['cadence', '--ozone-platform=x11']);
  // If the flag got lost anyway, it doesn't loop: Wayland for this run, nothing saved.
  withEnv({ WAYLAND_DISPLAY: 'wayland-0', CADENCE_X11_RESTARTED: '1' }, () => {
    const app = fakeApp();
    assert.deepEqual(applyDisplayMode(app), { mode: 'wayland', saved: null, restartForX11: false });
    assert.equal(app.switches['ozone-platform'], undefined);
    assert.equal(savedMode(app.dir), null);
  });
  // Wayland mode on a Wayland desktop needs no restart.
  withEnv({ WAYLAND_DISPLAY: 'wayland-0' }, () => {
    const app = fakeApp();
    saveMode(app.dir, 'wayland');
    assert.equal(applyDisplayMode(app).restartForX11, false);
  });
});

test('display mode: reading and dropping the --ozone-platform flag', () => {
  assert.equal(hasX11Flag(['cadence', '--ozone-platform=x11']), true);
  assert.equal(hasX11Flag(['cadence', '--ozone-platform', 'x11']), true);
  assert.equal(hasX11Flag(['cadence', '--ozone-platform=wayland']), false);
  assert.equal(hasX11Flag(['cadence', 'x11']), false);
  assert.deepEqual(withoutOzoneFlags(['--ozone-platform=x11', 'file.json']), ['file.json']);
  assert.deepEqual(withoutOzoneFlags(['--a', '--ozone-platform', 'wayland', '--b']), ['--a', '--b']);
});
