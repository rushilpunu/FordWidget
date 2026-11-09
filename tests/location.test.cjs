'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, prefs, cache, prepared, TIME, VIN } = require('./scriptable.cjs');

const located = () => cache({ place: { lat: 42.12345, lon: -83.12345, label: 'Synthetic street' }, fields: {
  fuel: { value: 53, at: TIME - 10000, source: 'FordPass' },
  position: { value: { lat: 42.12345, lon: -83.12345 }, at: TIME - 10000, source: 'FordPass' } } });
const seed = (h, app) => { for (const s of ['', '.bak']) h.state.files.set(app.store.path + s, JSON.stringify(located())); };
const clean = c => { assert.ok(c); assert.ok(!('position' in c.fields) && !('place' in c)); };
const cleanFiles = (h, app) => { for (const s of ['', '.bak']) clean(JSON.parse(h.state.files.get(app.store.path + s))); };

test('turning Parked location off erases both cache copies, keeps other data, and Start sends no location', async () => {
  const h = load(), vehicle = prefs({ home: { lat: 42.12345, lon: -83.12345 } }), app = await prepared(h, vehicle, located());
  seed(h, app);
  h.state.choices.push('✓  Parked location', -1);
  await app.customize(vehicle);
  cleanFiles(h, app);
  assert.equal(JSON.parse(h.state.files.get(app.store.path)).fields.fuel.value, 53);
  assert.equal(h.api.widgetOptions(h.api.secretGet('vehicle'), 'parked').show.parked, false);
  h.state.choices.push(-1);
  await app.action('start', vehicle);
  assert.equal(h.state.requests.length, 0);
  app.store.release();
});

test('Vehicle features immediately purges both copies when disabling location or saving an existing opt-out', async () => {
  for (const scenario of ['toggle-off', 'already-off']) {
    const h = load(), vehicle = prefs(scenario === 'already-off' ? { widget: { show: { parked: false } } } : {});
    const app = await prepared(h, vehicle, located());
    seed(h, app);
    if (scenario === 'toggle-off') {
      for (const suffix of ['', '.bak']) {
        const snapshot = JSON.parse(h.state.files.get(app.store.path + suffix));
        snapshot.nextFetch = TIME + 60000;
        h.state.files.set(app.store.path + suffix, JSON.stringify(snapshot));
      }
    } else {
      for (const name of ['mobile', 'autonomic']) h.api.secretRemove('token.' + name);
    }
    const tokens = [...h.state.secrets].filter(([key]) => key.includes('token.'));
    let menus = 0;
    const present = h.context.Alert.prototype.presentSheet;
    h.context.Alert.prototype.presentSheet = async function() {
      if (this.title === 'Vehicle features' && ++menus === 2) {
        assert.equal(h.api.secretGet('vehicle').widget.show.parked, false);
        cleanFiles(h, app); // The toggle must purge before the next prompt, not only on Done.
      }
      return present.call(this);
    };
    h.state.choices.push('OK', 'OK', ...(scenario === 'toggle-off' ? ['✓ Parked location · reported', -1] : [-1]));
    await app.compatibility(vehicle);
    assert.equal(h.state.choices.length, 0);
    assert.equal(h.api.secretGet('vehicle').widget.show.parked, false);
    cleanFiles(h, app);
    for (const suffix of ['', '.bak']) assert.equal(JSON.parse(h.state.files.get(app.store.path + suffix)).fields.fuel.value, 53);
    assert.deepEqual([...h.state.secrets].filter(([key]) => key.includes('token.')), tokens);
    assert.equal(h.state.requests.length + h.state.geocodes.length + h.state.safari.length, 0);
    app.store.release();
  }
});

test('a cooling-down telemetry read physically purges disabled location from both raw cache files', async () => {
  const h = load(), vehicle = prefs({ widget: { show: { parked: false } } }), app = await prepared(h, vehicle);
  seed(h, app);
  for (const suffix of ['', '.bak']) {
    const snapshot = JSON.parse(h.state.files.get(app.store.path + suffix));
    snapshot.nextFetch = TIME + 60000;
    h.state.files.set(app.store.path + suffix, JSON.stringify(snapshot));
    assert.ok(snapshot.fields.position && snapshot.place, 'Start with raw on-disk coordinates in both files');
  }
  const tokens = [...h.state.secrets].filter(([key]) => key.includes('token.'));
  const result = await new h.api.FordAPIClient(app.auth, app.store, vehicle).getVehicleStatus();
  assert.match(result.note, /cooling down/);
  clean(result.cache);
  cleanFiles(h, app);
  assert.equal(result.cache.fields.fuel.value, 53);
  assert.equal(result.cache.nextFetch, TIME + 60000);
  assert.deepEqual([...h.state.secrets].filter(([key]) => key.includes('token.')), tokens);
  assert.equal(h.state.requests.length + h.state.geocodes.length + h.state.safari.length, 0);
  app.store.release();
});

test('disabled location is hidden on primary and backup reads and by every consumer', async () => {
  const h = load(), vehicle = prefs({ widget: { show: { parked: false } } }), app = await prepared(h, vehicle);
  seed(h, app);
  clean(app.store.read());
  h.state.files.set(app.store.path, '{invalid cache');
  clean(app.store.read());
  await new h.api.FordAPIClient(app.auth, app.store, vehicle).updatePlace();
  await app.startWeather();
  await app.parked(vehicle);
  assert.equal(h.state.requests.length + h.state.geocodes.length + h.state.safari.length, 0);
  assert.doesNotMatch(JSON.stringify(h.state.alerts), /42\.12345|Synthetic street/);
  app.store.release();
});

test('writes sanitize new data and old backups while disabled; app open cleans old caches', async () => {
  const h = load(), vehicle = prefs({ widget: { show: { parked: false } } }), app = await prepared(h, vehicle);
  seed(h, app);
  const stale = located();
  app.store.write(stale);
  clean(stale);
  cleanFiles(h, app);
  seed(h, app);
  h.state.files.set(app.store.path, '{broken');
  app.store.release();
  h.args.queryParameters.action = 'start';
  h.state.choices.push(-1);
  await app.run();
  assert.equal(h.state.files.has(app.store.path), false);
  clean(JSON.parse(h.state.files.get(app.store.path + '.bak')));
});

test('telemetry fetched while disabled never stores a position', async () => {
  const h = load(), vehicle = prefs({ widget: { show: { parked: false } } }), app = await prepared(h, vehicle);
  seed(h, app);
  h.state.responses.push({ body: { vin: VIN, metrics: {
    fuelLevel: { value: 61, updateTime: new Date(TIME).toISOString() },
    position: { value: { location: { lat: 42.98765, lon: -83.98765 } }, updateTime: new Date(TIME).toISOString() } } } });
  const { cache: c } = await new h.api.FordAPIClient(app.auth, app.store, vehicle).getVehicleStatus();
  clean(c);
  cleanFiles(h, app);
  assert.equal(c.fields.fuel.value, 61);
  app.store.release();
});

test('a cache that cannot be rewritten is removed, and a failed removal is reported', async () => {
  const h = load(), vehicle = prefs(), app = await prepared(h, vehicle, located());
  seed(h, app);
  const write = h.fm.writeString, remove = h.fm.remove;
  h.fm.writeString = (f, v) => { if (f.startsWith(app.store.path)) throw new Error('write failure'); return write(f, v); };
  h.state.choices.push('✓  Parked location', -1);
  await app.customize(vehicle);
  assert.equal(h.state.files.has(app.store.path) || h.state.files.has(app.store.path + '.bak'), false);
  seed(h, app);
  h.fm.remove = f => { if (f === app.store.path) throw new Error('remove failure'); return remove(f); };
  assert.throws(() => app.store.purgeLocation(), /Saved location could not be removed/);
  assert.equal(h.state.files.has(app.store.path + '.bak'), false);
  app.store.release();
});

test('re-enabling keeps old coordinates erased; enabled location still geocodes and uses the rounded weather fallback', async () => {
  const h = load(), vehicle = prefs(), app = await prepared(h, vehicle, located());
  seed(h, app);
  h.state.choices.push('✓  Parked location', '○  Parked location', -1);
  await app.customize(vehicle);
  clean(app.store.read());
  const snapshot = located(); delete snapshot.place; app.store.write(snapshot);
  await new h.api.FordAPIClient(app.auth, app.store, vehicle).updatePlace();
  assert.equal(h.state.geocodes.length, 1);
  h.state.responses.push({ body: { current: { temperature_2m: 45 } } });
  h.state.choices.push(-1);
  await app.action('start', vehicle);
  const url = new URL(h.state.requests[0].url);
  assert.equal(url.origin, 'https://api.open-meteo.com');
  assert.equal(url.searchParams.get('latitude'), '42.12');
  app.store.release();
});
