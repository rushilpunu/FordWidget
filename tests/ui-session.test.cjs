'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, prefs, cache, prepared, TIME, VIN } = require('./scriptable.cjs');

const flows = [
  { name: 'gallery confirmation', method: 'chooseDesign', boundary: 'presentAlert', title: 'Use dashboard?', choices: ['Small', 'Dashboard', 'Use design'] },
  { name: 'compatibility toggle', method: 'compatibility', boundary: 'presentSheet', title: 'Vehicle features', choices: ['OK', 'OK', '✓ Parked location · reported', -1] },
  { name: 'compatibility Done save', method: 'compatibility', boundary: 'presentSheet', title: 'Vehicle features', choices: ['OK', 'OK', -1] },
  { name: 'Customize widgets toggle', method: 'customize', boundary: 'presentSheet', title: 'Customize widgets', choices: ['✓  Parked location', -1] },
  { name: 'alert toggle', method: 'alertOptions', boundary: 'presentSheet', title: 'Alerts & attention', choices: ['✓ Unlocked', -1] },
  { name: 'alert threshold input', method: 'alertOptions', boundary: 'presentAlert', title: 'Alert threshold', choices: [7, 'Save', -1], threshold: 25 }
];

function located(vin = VIN, fuel = 53) {
  return cache({ vin, nextFetch: TIME + 900000, fields: {
    fuel: { value: fuel, at: TIME - 1000, source: 'FordPass' },
    position: { value: { lat: 42.31, lon: -83.21 }, at: TIME - 1000, source: 'FordPass' }
  }, place: { lat: 42.31, lon: -83.21, label: 'Synthetic location' } });
}
async function settings() {
  const h = load(), vehicle = prefs({ widget: { show: { parked: true } } }), snapshot = located();
  const app = await prepared(h, vehicle, snapshot);
  // Compatibility can use cached suggestions without performing its optional read.
  for (const name of ['mobile', 'official']) h.api.secretRemove('token.' + name);
  for (const suffix of ['', '.bak']) h.state.files.set(app.store.path + suffix, JSON.stringify(snapshot));
  return { h, vehicle, app };
}
const cacheCopies = (h, store) => ['', '.bak'].map(suffix => [store.path + suffix, h.state.files.get(store.path + suffix)]);

for (const flow of flows) {
  test(`${flow.name}: takeover and a changed configured VIN cannot save stale preferences`, async () => {
    for (const scenario of ['takeover', 'changed-vin']) {
      const { h, app, vehicle } = await settings();
      let interrupted = false, successor = null, expectedSecrets, expectedCopies;
      const present = h.context.Alert.prototype[flow.boundary];
      h.context.Alert.prototype[flow.boundary] = async function() {
        if (flow.threshold !== undefined && this.title === flow.title) this.fields[0].value = String(flow.threshold);
        const choice = await present.call(this);
        if (this.title === flow.title && !interrupted) {
          interrupted = true;
          if (scenario === 'takeover') {
            successor = new h.api.LocalStore();
            h.state.choices.unshift('Take over'); await successor.acquire();
          }
          // Keep the same VIN during takeover so only a valid lease check can
          // reject it. The second case keeps the lease and changes only the VIN.
          const replacement = prefs({ vin: scenario === 'takeover' ? VIN : '1FTFW1E50JFA00002', name: 'Current saved settings',
            widget: { show: { parked: true }, design: { small: 'showcase' } }, alerts: { enabled: { lock: true } } });
          h.api.secretSet('vehicle', replacement);
          (successor || app.store).write(located(replacement.vin, 44));
          expectedSecrets = [...h.state.secrets]; expectedCopies = cacheCopies(h, app.store);
        }
        return choice;
      };
      h.state.choices.push(...flow.choices);
      await assert.rejects(app[flow.method](vehicle), /session|vehicle/i);
      assert.equal(interrupted, true);
      assert.deepEqual([...h.state.secrets], expectedSecrets, 'A stale dialog must not overwrite current preferences or tokens');
      assert.deepEqual(cacheCopies(h, app.store), expectedCopies, 'A rejected save must not purge or rewrite the current vehicle cache');
      assert.equal(h.state.requests.length, 0); assert.equal(h.state.geocodes.length, 0); assert.equal(h.state.safari.length, 0);
      assert.equal(h.state.notifications.length, 0);
      if (successor) { assert.throws(() => app.store.assertLease(), /session expired/i); successor.assertLease(); successor.release(); }
      else { app.store.assertLease(); app.store.release(); }
    }
  });
}

test('the current owner can save each settings flow and compatibility opt-out still purges both raw cache copies', async () => {
  for (const flow of flows.filter(flow => flow.name !== 'compatibility Done save')) {
    const { h, app, vehicle } = await settings();
    const tokens = [...h.state.secrets].filter(([key]) => key.includes('token.'));
    if (flow.threshold !== undefined) {
      const show = h.context.Alert.prototype.presentAlert;
      h.context.Alert.prototype.presentAlert = async function() { if (this.title === flow.title) this.fields[0].value = String(flow.threshold); return show.call(this); };
    }
    h.state.choices.push(...flow.choices); await app[flow.method](vehicle);
    const saved = h.api.secretGet('vehicle');
    assert.equal(saved.vin, VIN); assert.equal(saved.name, vehicle.name);
    if (flow.method === 'chooseDesign') assert.equal(saved.widget.design.small, 'dashboard');
    else if (flow.method === 'alertOptions') {
      if (flow.threshold !== undefined) assert.equal(saved.alerts.tire, flow.threshold);
      else assert.equal(saved.alerts.enabled.lock, false);
    }
    else {
      assert.equal(saved.widget.show.parked, false);
      for (const [, text] of cacheCopies(h, app.store)) {
        const snapshot = JSON.parse(text);
        assert.equal(Object.hasOwn(snapshot.fields, 'position'), false); assert.equal(Object.hasOwn(snapshot, 'place'), false);
        assert.equal(snapshot.fields.fuel.value, 53);
      }
    }
    assert.deepEqual([...h.state.secrets].filter(([key]) => key.includes('token.')), tokens);
    assert.equal(h.state.requests.length, 0); assert.equal(h.state.geocodes.length, 0); assert.equal(h.state.safari.length, 0);
    app.store.assertLease(); app.store.release();
  }
});
