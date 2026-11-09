'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { load, prefs, cache, prepared, plain, TIME, VIN } = require('./scriptable.cjs');

const OTHER_VIN = '1FTFW1E50JFA00002';
const RECEIPT = 'synthetic-refresh-receipt';
const iso = at => new Date(at).toISOString();
const telemetryURL = 'https://api.autonomic.ai/v1/telemetry/sources/fordpass/vehicles/' + VIN;
const commandURL = 'https://api.autonomic.ai/v1/command/vehicles/' + VIN + '/commands';
const originalBody = { properties: {}, tags: {}, type: 'statusRefresh', wakeUp: true };
const raw = (id = 'synthetic-old', state = 'SUCCESS') => ({ vin: VIN, metrics: {},
  states: { statusRefreshCommand: { commandId: id, value: { toState: state } } } });
const reading = (value = 63, at = TIME - 10000) => ({ vin: VIN, metrics: { fuelLevel: { value, updateTime: iso(at) } } });
const posts = h => h.state.requests.filter(request => request.method === 'POST');
const copies = (h, app) => ['', '.bak'].map(suffix => h.state.files.get(app.store.path + suffix));

async function fixture(extra = {}, vehicleExtra = {}) {
  const h = load(), vehicle = prefs(vehicleExtra);
  const snapshot = cache({ fields: {
    fuel: { value: 40, at: TIME - 3600000, source: 'FordPass' },
    oil: { value: 49, at: TIME - 7200000, source: 'FordConnect' }
  }, nextFetch: TIME + 300000, ...extra });
  const app = await prepared(h, vehicle, snapshot);
  return { h, app, vehicle, snapshot, api: new h.api.FordAPIClient(app.auth, app.store, vehicle) };
}
function successReplies(h) {
  h.state.responses.push({ body: raw() }, { body: { id: RECEIPT, status: 'accepted' } }, { body: raw(RECEIPT, 'SUCCESS') });
}
function actions(tree) {
  const out = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    const match = String(node.url || '').match(/[?&]action=([^&]*)/);
    if (match) out.push(decodeURIComponent(match[1]));
    for (const child of node.children || []) visit(child);
  };
  visit(tree); return out;
}

test('canceling the single refresh confirmation sends nothing and changes no cache or timers', async () => {
  const { h, app, vehicle } = await fixture();
  const before = copies(h, app), secrets = Array.from(h.state.secrets);
  const write = h.fm.writeString, cacheWrites = [];
  h.fm.writeString = (file, value) => { if (file.startsWith(app.store.path)) cacheWrites.push(file); return write(file, value); };
  h.state.choices.push(-1);
  const result = await app.action('refreshwidget', vehicle);
  assert.equal(result.outcome, 'cancelled');
  assert.equal(h.state.requests.length, 0);
  assert.deepEqual(copies(h, app), before);
  assert.deepEqual(cacheWrites, []);
  assert.deepEqual(Array.from(h.state.secrets), secrets);
  assert.equal(h.state.alerts.length, 1);
  assert.equal(h.state.alerts[0].title, 'Refresh vehicle data?');
  assert.deepEqual(h.state.alerts[0].actions.map(action => action.title), ['Refresh widget']);
  app.store.release();
});

test('a confirmed refresh sends the original command once, waits for matching SUCCESS, then reads back field times', async () => {
  const { h, app, vehicle, snapshot } = await fixture();
  h.state.choices.push('Refresh widget');
  h.state.responses.push({ body: raw() }, { body: { id: RECEIPT, status: 'success' } },
    { body: raw(RECEIPT, 'SUCCEEDED_ON_DEVICE') }, { body: raw(RECEIPT, 'SUCCESS') }, { body: reading() });
  const result = await app.action('refreshwidget', vehicle), saved = app.store.read();
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(plain(result.steps), { generalStatus: 'device_succeeded', telemetry: 'saved' });
  assert.deepEqual(h.state.requests.map(request => request.method), ['GET', 'POST', 'GET', 'GET', 'GET']);
  assert.equal(posts(h)[0].url, commandURL); assert.deepEqual(JSON.parse(posts(h)[0].body), originalBody);
  assert.equal(posts(h)[0].headers['Content-Type'], 'application/json');
  assert.ok(h.state.requests.filter(request => request.method === 'GET').every(request => request.url === telemetryURL));
  assert.equal(saved.fields.fuel.value, 63); assert.equal(saved.fields.fuel.at, TIME - 10000);
  assert.deepEqual(plain(saved.fields.oil), snapshot.fields.oil);
  assert.equal(saved.widgetRefreshAfter, TIME + 60000);
  assert.equal(saved.commandAfter, TIME + 30000); assert.equal(saved.wakeAfter, TIME + 900000);
  assert.deepEqual(plain(saved.widgetRefreshLast), { attemptAt: TIME, outcome: 'completed', steps: plain(result.steps) });
  assert.deepEqual(plain(saved.generalStatusRequest), { attemptAt: TIME, outcome: 'device_succeeded' });
  assert.equal(h.state.alerts.filter(alert => alert.title === 'Refresh vehicle data?').length, 1);
  assert.equal(h.state.geocodes.length, 0); assert.equal(h.state.safari.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /all (?:values|readings) (?:are )?(?:fresh|current)|all data updated/i);
  app.store.release();
});

test('only the current raw command ID confirms; history, unrelated IDs and reused historical receipts cannot', async () => {
  for (const historicalReceipt of [false, true]) {
    const { h, app, api } = await fixture();
    h.state.responses.push({ body: raw(historicalReceipt ? RECEIPT : 'synthetic-old') }, { body: { id: RECEIPT, status: 'success' } });
    if (!historicalReceipt) for (let poll = 0; poll < 8; poll++) h.state.responses.push({ body: {
      ...raw('synthetic-unrelated', 'SUCCESS'),
      statusRefreshCommand: { commandId: RECEIPT, value: { toState: 'SUCCESS' } },
      history: [{ commandId: RECEIPT, value: { toState: 'SUCCESS' } }]
    } });
    const result = await api.requestGeneralStatus(true);
    assert.equal(result.outcome, 'accepted_unconfirmed'); assert.equal(result.dispatched, true);
    assert.equal(posts(h).length, 1); assert.equal(h.state.requests.length, historicalReceipt ? 2 : 10);
    assert.ok(h.state.clock - TIME <= 40000);
    assert.equal(app.store.read().generalStatusRequest.outcome, 'accepted_unconfirmed');
    app.store.release();
  }
});

test('matched terminal failures and uncertain dispatch never replay the status request', async () => {
  for (const state of ['FAILURE', 'CANCELLED', 'EXPIRED']) {
    const { h, app, api } = await fixture();
    h.state.responses.push({ body: raw() }, { body: { id: RECEIPT, status: 'accepted' } }, { body: raw(RECEIPT, state) });
    const result = await api.requestGeneralStatus(true);
    assert.equal(result.outcome, 'device_failed'); assert.equal(result.dispatched, true);
    assert.equal(h.state.requests.length, 3); assert.equal(posts(h).length, 1); app.store.release();
  }
  for (const reply of [new Error('synthetic transport detail'), { status: 503 }, { body: {} }]) {
    const { h, app, api } = await fixture();
    h.state.responses.push({ body: raw() }, reply);
    const result = await api.requestGeneralStatus(true);
    assert.equal(result.outcome, 'delivery_uncertain'); assert.equal(result.dispatched, true);
    assert.equal(h.state.requests.length, 2); assert.equal(posts(h).length, 1);
    assert.equal(app.store.read().wakeAfter, TIME + 900000);
    assert.doesNotMatch(JSON.stringify(result), /synthetic transport detail/); app.store.release();
  }
});

test('an overdue matching response cannot confirm completion or trigger another poll', async () => {
  const { h, app, api } = await fixture();
  h.state.responses.push({ body: raw() }, { body: { id: RECEIPT, status: 'accepted' } }, () => {
    h.state.clock = TIME + 40001; return { body: raw(RECEIPT, 'SUCCESS') };
  });
  const result = await api.requestGeneralStatus(true);
  assert.equal(result.outcome, 'accepted_unconfirmed'); assert.equal(h.state.requests.length, 3);
  assert.equal(posts(h).length, 1); assert.equal(app.auth.timeout, h.api.SETTINGS.timeout); app.store.release();
});

test('partial or unavailable readback retains cached fields and measurement times after the request', async () => {
  const partial = await fixture();
  partial.h.api.secretSet('token.official', { access: 'synthetic-official', expires: TIME + 3600000 });
  partial.h.state.choices.push('Refresh widget'); successReplies(partial.h);
  partial.h.state.responses.push({ status: 503 }, { body: reading(71, TIME - 120000) });
  const result = await partial.app.refreshWidget(partial.vehicle), saved = partial.app.store.read();
  assert.equal(result.steps.generalStatus, 'device_succeeded'); assert.equal(result.steps.telemetry, 'partial');
  assert.equal(saved.fields.fuel.value, 71); assert.equal(saved.fields.fuel.at, TIME - 120000);
  assert.deepEqual(plain(saved.fields.oil), partial.snapshot.fields.oil);
  assert.equal(posts(partial.h).length, 1); assert.equal(partial.h.state.requests.length, 5); partial.app.store.release();

  const unavailable = await fixture(); unavailable.h.state.choices.push('Refresh widget'); successReplies(unavailable.h);
  unavailable.h.state.responses.push(new Error('synthetic readback failure'));
  const failed = await unavailable.app.refreshWidget(unavailable.vehicle);
  assert.equal(failed.steps.telemetry, 'cached_or_unavailable');
  assert.deepEqual(plain(unavailable.app.store.read().fields), unavailable.snapshot.fields);
  assert.equal(posts(unavailable.h).length, 1); assert.equal(unavailable.h.state.requests.length, 4);
  unavailable.app.store.release();

  for (const failedStage of ['baseline', 'command']) {
    const f = await fixture(); f.h.state.choices.push('Refresh widget');
    if (failedStage === 'baseline') f.h.state.responses.push({ body: {} });
    else f.h.state.responses.push({ body: raw() }, { body: { id: RECEIPT, status: 'accepted' } }, { body: raw(RECEIPT, 'FAILURE') });
    f.h.state.responses.push({ body: reading() });
    const checked = await f.app.refreshWidget(f.vehicle);
    assert.equal(checked.steps.generalStatus, failedStage === 'baseline' ? 'baseline_unavailable' : 'device_failed');
    assert.equal(checked.steps.telemetry, 'saved'); assert.equal(f.app.store.read().fields.fuel.value, 63);
    assert.equal(posts(f.h).length, failedStage === 'baseline' ? 0 : 1); f.app.store.release();
  }
});

test('local refresh cooling sends nothing, but command cooling still permits forced passive readback', async () => {
  const local = await fixture({ widgetRefreshAfter: TIME + 60000 });
  const before = copies(local.h, local.app);
  const result = await local.app.refreshWidget(local.vehicle);
  assert.equal(result.outcome, 'cooldown'); assert.equal(local.h.state.requests.length, 0);
  assert.deepEqual(copies(local.h, local.app), before); local.app.store.release();
  for (const block of ['commandAfter', 'wakeAfter', 'commands', 'commands.generalStatus']) {
    const f = await fixture(block.includes('.') || block === 'commands' ? {} : { [block]: TIME + 60000 });
    if (block === 'commands' || block.includes('.')) f.h.api.secretSet('gate.' + block, { failures: 1, next: TIME + 3600000 });
    f.h.state.choices.push('Refresh widget'); f.h.state.responses.push({ body: reading() });
    const read = await f.app.refreshWidget(f.vehicle);
    assert.equal(read.steps.generalStatus, 'cooldown'); assert.equal(read.steps.telemetry, 'saved');
    assert.equal(f.h.state.requests.length, 1); assert.equal(f.h.state.requests[0].method, 'GET');
    assert.equal(f.h.state.requests[0].url, telemetryURL); assert.equal(f.app.store.read().fields.fuel.at, TIME - 10000);
    f.app.store.release();
  }
});

test('force bypasses only the local fetch timer and preserves authentication and telemetry backoff', async () => {
  const normal = await fixture();
  await normal.api.getVehicleStatus(); assert.equal(normal.h.state.requests.length, 0);
  normal.h.state.responses.push({ body: reading() }); await normal.api.getVehicleStatus(true);
  assert.equal(normal.h.state.requests.length, 1); normal.app.store.release();
  for (const scope of ['telemetry.mobile', 'auth.autonomic']) {
    const f = await fixture(); f.h.api.secretSet('gate.' + scope, { failures: 2, next: TIME + 3600000 });
    if (scope === 'auth.autonomic') f.h.api.secretSet('token.autonomic', { access: 'synthetic-expired', expires: TIME - 1 });
    const result = await f.api.getVehicleStatus(true);
    assert.equal(f.h.state.requests.length, 0); assert.deepEqual(plain(result.cache.fields), f.snapshot.fields);
    assert.equal(f.h.api.secretGet('gate.' + scope).next, TIME + 3600000); f.app.store.release();
  }
  const server = await fixture(); server.h.state.choices.push('Refresh widget');
  server.h.state.responses.push({ body: raw() }, { status: 429, headers: { 'Retry-After': '3600' } }, { body: reading() });
  const result = await server.app.refreshWidget(server.vehicle);
  assert.equal(result.steps.generalStatus, 'delivery_uncertain'); assert.equal(result.steps.telemetry, 'saved');
  assert.equal(server.h.api.secretGet('gate.commands.generalStatus').next, TIME + 3600000);
  assert.equal(posts(server.h).length, 1); assert.equal(server.h.state.requests.length, 3); server.app.store.release();

  for (const origin of ['legacy', 'combined']) {
    const f = await fixture();
    if (origin === 'combined') f.h.state.responses.push({ body: raw() });
    f.h.state.responses.push({ status: 429, headers: { 'Retry-After': '3600' } });
    if (origin === 'legacy') await assert.rejects(f.api.sendCommand(VIN, 'refresh'), /HTTP 429/);
    else assert.equal((await f.api.requestGeneralStatus(true)).outcome, 'delivery_uncertain');
    assert.equal(f.h.api.secretGet('gate.commands.generalStatus').next, TIME + 3600000);
    f.app.store.release(); f.h.state.clock += 900001;
    const reopened = new f.h.api.AppController(); await reopened.store.acquire();
    const client = new f.h.api.FordAPIClient(reopened.auth, reopened.store, f.vehicle), before = f.h.state.requests.length;
    if (origin === 'legacy') assert.equal((await client.requestGeneralStatus(true)).outcome, 'cooldown');
    else await assert.rejects(client.sendCommand(VIN, 'refresh'), /cooling down/);
    assert.equal(f.h.state.requests.length, before, 'The other refresh path must retain Retry-After after the local wake timer expires');
    reopened.store.release();
  }
});

test('disabled refresh compatibility blocks deep links and hides the button; widget runs remain passive', async () => {
  const disabled = await fixture({}, { widget: { medium: 'controls' }, compatibility: { commands: { refresh: false }, verified: {} } });
  const before = copies(disabled.h, disabled.app);
  await assert.rejects(disabled.app.action('refreshwidget', disabled.vehicle), /disabled/i);
  assert.equal(disabled.h.state.requests.length, 0); assert.deepEqual(copies(disabled.h, disabled.app), before);
  assert.ok(!actions(new disabled.h.api.WidgetRenderer(disabled.vehicle, disabled.app.store.read()).build('medium')).includes('refreshwidget'));
  disabled.app.store.release();
  const changed = await fixture();
  const changedBefore = copies(changed.h, changed.app), present = changed.h.context.Alert.prototype.presentAlert;
  changed.h.context.Alert.prototype.presentAlert = async function() {
    const choice = await present.call(this);
    if (this.title === 'Refresh vehicle data?') changed.h.api.secretSet('vehicle', prefs({ compatibility: { commands: { refresh: false } } }));
    return choice;
  };
  changed.h.state.choices.push('Refresh widget');
  const blocked = await changed.app.refreshWidget(changed.vehicle);
  assert.equal(blocked.outcome, 'blocked'); assert.equal(changed.h.state.requests.length, 0);
  assert.deepEqual(copies(changed.h, changed.app), changedBefore); changed.app.store.release();
  const passive = await fixture({}, { widget: { medium: 'controls' } });
  assert.ok(actions(new passive.h.api.WidgetRenderer(passive.vehicle, passive.app.store.read()).build('medium')).includes('refreshwidget'));
  passive.app.store.release(); passive.h.config.runsInApp = false; passive.h.config.runsInWidget = true;
  passive.h.args.queryParameters.action = 'refreshwidget'; await passive.app.run();
  assert.equal(passive.h.state.requests.length, 0); assert.equal(passive.h.state.alerts.length, 0);
});

test('changing the configured VIN during baseline or forced readback prevents later I/O and stale cache writes', async () => {
  for (const stage of ['baseline', 'readback']) {
    const f = await fixture(stage === 'readback' ? { wakeAfter: TIME + 60000 } : {});
    let replacement;
    f.h.state.choices.push('Refresh widget'); f.h.state.responses.push(() => {
      f.h.api.secretSet('vehicle', prefs({ vin: OTHER_VIN }));
      replacement = JSON.stringify(cache({ vin: OTHER_VIN, fields: {}, marker: 'new-vehicle-cache' }));
      f.h.state.files.set(f.app.store.path, replacement);
      return { body: stage === 'baseline' ? raw() : reading() };
    });
    const result = await f.app.refreshWidget(f.vehicle);
    assert.equal(result.outcome, 'blocked'); assert.equal(f.h.state.requests.length, 1); assert.equal(posts(f.h).length, 0);
    assert.equal(f.h.state.files.get(f.app.store.path), replacement); f.app.store.release();
  }
});

test('losing the lease at any network boundary prevents later requests and writes to the replacement session', async () => {
  for (const stage of ['baseline', 'post', 'poll', 'readback']) {
    const f = await fixture(stage === 'readback' ? { wakeAfter: TIME + 60000 } : {});
    let replacement, secrets;
    const takeover = body => () => {
      f.h.fm.writeString(f.app.store.lockPath, JSON.stringify({ owner: 'synthetic-new-owner', started: TIME, until: TIME + 900000 }));
      replacement = JSON.stringify(cache({ fields: { fuel: { value: 88, at: TIME, source: 'FordPass' } }, marker: 'new-owner-cache' }));
      f.h.state.files.set(f.app.store.path, replacement); secrets = Array.from(f.h.state.secrets);
      return { body };
    };
    if (stage === 'baseline') f.h.state.responses.push(takeover(raw()));
    if (stage === 'post') f.h.state.responses.push({ body: raw() }, takeover({ id: RECEIPT, status: 'accepted' }));
    if (stage === 'poll') f.h.state.responses.push({ body: raw() }, { body: { id: RECEIPT, status: 'accepted' } }, takeover(raw(RECEIPT, 'SUCCESS')));
    if (stage === 'readback') f.h.state.responses.push(takeover(reading()));
    f.h.state.choices.push('Refresh widget'); const result = await f.app.refreshWidget(f.vehicle);
    assert.equal(result.outcome, 'blocked'); assert.equal(f.h.state.requests.length, { baseline: 1, post: 2, poll: 3, readback: 1 }[stage]);
    assert.equal(f.h.state.files.get(f.app.store.path), replacement);
    assert.deepEqual(Array.from(f.h.state.secrets), secrets);
    assert.equal(JSON.parse(f.h.state.files.get(f.app.store.lockPath)).owner, 'synthetic-new-owner');
  }
});

test('the upstream namespace and US settings stay original and legacy Wake keeps its confirmation and body', async () => {
  const { h, app, vehicle, api } = await fixture();
  assert.equal(h.api.secretKey('vehicle'), 'FordWidget.v1.vehicle');
  assert.equal(h.api.SETTINGS.autonomic, 'https://api.autonomic.ai/v1');
  assert.equal(h.api.SETTINGS.officialBase, 'https://api.vehicle.ford.com/fcon-query/v1');
  assert.equal(h.api.SETTINGS.policy, 'B2C_1A_SignInSignUp_en-US');
  assert.equal(h.api.SETTINGS.applicationId, 'BFE8C5ED-D687-4C19-A5DD-F92CDFC4503A');
  const source = fs.readFileSync(path.join(__dirname, '../FordWidget.js'), 'utf8');
  assert.doesNotMatch(source, /ProPowerPreview|requestProPowerStatus|readProPower|telemetry\.proPower|commands\.proPower/);
  await assert.rejects(api.requestGeneralStatus(), /confirm/i); assert.equal(h.state.requests.length, 0);
  h.state.choices.push('Send command'); h.state.responses.push({ body: { id: 'synthetic-legacy-wake', status: 'accepted' } });
  await app.action('refresh', vehicle);
  assert.match(h.state.alerts[0].title, /^Wake vehicle/);
  assert.equal(h.state.requests.length, 1); assert.equal(posts(h)[0].url, commandURL);
  assert.deepEqual(JSON.parse(posts(h)[0].body), originalBody); app.store.release();
});
