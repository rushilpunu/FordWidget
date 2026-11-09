'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {load, plain, TIME, VIN} = require('./scriptable.cjs');
const sampleAt = TIME - 120000;
const iso = value => new Date(value).toISOString();
function payload(value, extra = {}) {
  return {vin: VIN, updateTime: iso(TIME - 1000), metrics: {
    oilLifeRemaining: {value: 75, updateTime: iso(sampleAt)},
    fuelLevel: {value, updateTime: iso(sampleAt)}, ...extra}};
}
function normalized(h, raw, source = 'FordPass') {
  return h.api.normalize(raw, VIN, source, TIME);
}

test('above-full fuel displays 100 while preserving its numeric raw value, source and measurement time', () => {
  const h = load(), raw = payload(103.25), candidate = normalized(h, raw);
  assert.deepEqual(plain(candidate.fuel), {value: 100, rawValue: 103.25, at: sampleAt, source: 'FordPass', fetchedAt: TIME});
  const saved = h.api.mergeFields({}, {}, candidate);
  assert.deepEqual(plain(saved.fuel), plain(candidate.fuel), 'A previously missing fuel field is retained by the normal cache merge');
  assert.equal(h.state.requests.length, 0);
});

test('zero, normal percentages and inherited numeric strings retain numeric values without treating zero as missing', () => {
  const h = load();
  for (const [input, value, rawValue] of [[0, 0, 0], ['0', 0, 0], [58.5, 58.5, 58.5], [' 58.5 ', 58.5, 58.5], [100, 100, 100], ['103.25', 100, 103.25]]) {
    const field = normalized(h, payload(input)).fuel;
    assert.equal(field.value, value); assert.equal(field.rawValue, rawValue); assert.equal(field.at, sampleAt);
  }
});

test('negative, nonfinite and unsupported fuel inputs stay unknown instead of becoming empty or full', () => {
  const h = load();
  for (const value of [-1, -0.25, NaN, Infinity, -Infinity, '', '   ', 'not a number', '103.25%', '1e999', null, undefined, true, false, [], {}, [100]]) {
    const fields = normalized(h, payload(value));
    assert.equal(fields.fuel, undefined, 'Fuel must remain unknown for ' + String(value));
    assert.equal(fields.oil.value, 75, 'An invalid fuel reading does not discard other telemetry');
  }
});

test('oil and battery remain bounded to 0 through 100 with no raw-fuel metadata added', () => {
  const h = load();
  for (const value of [100.01, 103.25, -1, NaN, Infinity, true]) {
    const fields = normalized(h, payload(103.25, {oilLifeRemaining: {value}, batteryStateOfCharge: {value}}));
    assert.equal(fields.fuel.value, 100); assert.equal(fields.oil, undefined); assert.equal(fields.battery, undefined);
  }
  for (const value of [0, '0', 100, '75.5']) {
    const fields = normalized(h, payload(0, {oilLifeRemaining: {value}, batteryStateOfCharge: {value}}));
    assert.equal(fields.oil.value, Number(value)); assert.equal(fields.battery.value, Number(value));
    assert.equal(Object.hasOwn(fields.oil, 'rawValue'), false); assert.equal(Object.hasOwn(fields.battery, 'rawValue'), false);
  }
});

test('fuel retains existing timestamp precedence and never substitutes fetch time for a missing measurement time', () => {
  const h = load();
  const own = payload(103.25); assert.equal(normalized(h, own).fuel.at, sampleAt);
  const fallback = payload(103.25); delete fallback.metrics.fuelLevel.updateTime;
  assert.equal(normalized(h, fallback).fuel.at, TIME - 1000);
  delete fallback.updateTime;
  assert.equal(normalized(h, fallback).fuel.at, null);
  fallback.metrics.fuelLevel.updateTime = 'not a time';
  assert.equal(normalized(h, fallback).fuel.at, null);
});

test('fuel clamping does not change ranges, units, other field normalization or payload contents', () => {
  const h = load(), raw = payload(103.25, {
    fuelRange: {value: 160.9344, unit: 'km', updateTime: iso(sampleAt)},
    odometer: {value: 1234, unit: 'mi', updateTime: iso(sampleAt)},
    batteryStateOfCharge: {value: 59, updateTime: iso(sampleAt)},
    tirePressure: [{vehicleWheel: 'FRONT_LEFT', value: 35, unit: 'psi', updateTime: iso(sampleAt)}],
    outsideTemperature: {value: 22, updateTime: iso(sampleAt)},
    ignitionStatus: {value: 'off', updateTime: iso(sampleAt)}
  });
  const before = JSON.stringify(raw), fields = normalized(h, raw, 'FordConnect');
  assert.equal(fields.fuel.value, 100); assert.equal(fields.fuel.source, 'FordConnect');
  assert.ok(Math.abs(fields.range.value - 100) < 0.00001); assert.equal(fields.odometer.value, 1234);
  assert.equal(fields.oil.value, 75); assert.equal(fields.battery.value, 59); assert.equal(fields.fl.value, 35);
  assert.equal(fields.outsideTemp.value, 22); assert.equal(fields.ignition.value, 'OFF');
  for (const key of ['range', 'odometer', 'oil', 'battery', 'fl', 'outsideTemp', 'ignition']) assert.equal(fields[key].at, sampleAt);
  assert.equal(JSON.stringify(raw), before);
});

test('a different VIN is still rejected before fuel normalization', () => {
  const h = load(), raw = payload(103.25); raw.vin = '1FTFW1E50JFA00002';
  assert.throws(() => normalized(h, raw), /VIN does not match/);
  assert.equal(h.state.requests.length, 0);
});
