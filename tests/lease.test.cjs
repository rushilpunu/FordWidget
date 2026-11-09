'use strict';
// Offline: `node --test tests/`. A run that lost its lease must not touch gates or tokens.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function load() {
  const src = fs.readFileSync(__dirname + '/../FordWidget.js', 'utf8');
  const files = new Map(), secrets = new Map(), replies = [];
  let n = 0;
  const fm = {
    documentsDirectory: () => '/d', joinPath: (a, b) => a + '/' + b, fileExists: p => files.has(p),
    createDirectory: p => files.set(p, 1), readString: p => files.get(p), writeString: (p, v) => files.set(p, v),
    remove: p => files.delete(p), move: (a, b) => { files.set(b, files.get(a)); files.delete(a); },
  };
  class Request {
    async responseBody() {
      const r = await replies.shift()(); if (r instanceof Error) throw r;
      this.response = { statusCode: r.status, headers: {} }; return r.body || '{}';
    }
    loadString() { return this.responseBody(); }
    load() { return this.responseBody(); }
  }
  const context = vm.createContext({ Request, FileManager: { local: () => fm }, UUID: { string: () => 'u' + ++n },
    Keychain: { contains: k => secrets.has(k), get: k => secrets.get(k), set: (k, v) => secrets.set(k, v), remove: k => secrets.delete(k) },
    config: { runsInApp: true, runsInWidget: false }, console });
  new vm.Script(src.slice(0, src.lastIndexOf('try { await new AppController()')) +
    '\nglobalThis.T = { LocalStore, FordAuthManager, secretGet, secretSet };').runInContext(context);
  return { T: context.T, replies, secrets };
}

const sends = {
  json: (a, h) => a.request('telemetry.mobile', 'https://x.test/t', 'GET', null, h),
  image: (a, h) => a.requestImage('telemetry.mobile', 'https://x.test/p', h),
};
for (const kind of Object.keys(sends)) {
  for (const reply of [{ status: 200 }, { status: 429 }, { status: 401 }, new Error('offline')]) {
    test(`${kind}: late ${reply.status || 'transport failure'} after takeover leaves gate and tokens alone`, async () => {
      const { T, replies, secrets } = load();
      const old = new T.LocalStore(); old.fm.createDirectory(old.dir);
      assert.ok(old.acquireBackground());
      T.secretSet('token.autonomic', { access: 'a', refresh: null, expires: 1e15 });
      let finish; replies.push(() => new Promise(r => { finish = r; }));
      const late = sends[kind](new T.FordAuthManager(old), { Authorization: 'Bearer a', 'auth-token': 'a' }).then(() => null, e => e);
      await new T.LocalStore().acquire();
      T.secretSet('gate.telemetry.mobile', { failures: 5, next: 1e15 });
      const saved = Array.from(secrets);
      finish(reply);
      assert.match((await late).message, /App session expired/);
      assert.deepEqual(Array.from(secrets), saved);
    });
  }
}

test('a current owner still clears its gate on success', async () => {
  const { T, replies } = load();
  const s = new T.LocalStore(); await s.acquire();
  T.secretSet('gate.telemetry.mobile', { failures: 3, next: 0 });
  replies.push(async () => ({ status: 200 }));
  await sends.json(new T.FordAuthManager(s), {});
  assert.equal(T.secretGet('gate.telemetry.mobile'), null);
});
