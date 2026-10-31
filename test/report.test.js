'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createReport } = require('../src/lib/report');

test('records and aggregates per-category outcomes', () => {
  const report = createReport();
  report.record('roles', 'created', 'Created role A');
  report.record('roles', 'created', 'Created role B');
  report.record('channels', 'deleted', 'Deleted channel #x');
  report.record('channels', 'failed', 'Deleted channel #y', new Error('Missing Permissions'));

  const categories = report.categories();
  assert.equal(categories.length, 2);
  assert.equal(categories[0].label, 'Roles');
  assert.equal(categories[0].counts.created, 2);
  assert.equal(categories[1].counts.failed, 1);

  const totals = report.totals();
  assert.equal(totals.created, 2);
  assert.equal(totals.deleted, 1);
  assert.equal(totals.failed, 1);
});

test('failures are captured with their message', () => {
  const report = createReport();
  report.record('emojis', 'failed', 'Created emoji :x:', new Error('Maximum number of emojis reached'));
  const failures = report.failures();
  assert.equal(failures.length, 1);
  assert.equal(failures[0].category, 'emojis');
  assert.match(failures[0].error, /Maximum number of emojis/);
});

test('failure list is bounded', () => {
  const report = createReport({ maxFailures: 2 });
  for (let index = 0; index < 5; index += 1) report.record('roles', 'failed', `fail ${index}`);
  assert.equal(report.failures().length, 2);
  assert.equal(report.categories()[0].counts.failed, 5);
});

test('unknown outcomes are treated as failures rather than lost', () => {
  const report = createReport();
  report.record('roles', 'exploded', 'weird');
  assert.equal(report.categories()[0].counts.failed, 1);
});

test('toLines renders a readable summary', () => {
  const report = createReport();
  report.record('roles', 'created', 'a');
  report.record('roles', 'failed', 'b', new Error('nope'));
  const text = report.toLines().join('\n');
  assert.match(text, /Roles: 1 created, 1 failed/);
  assert.match(text, /failure\(s\):/);
});

test('an empty report renders nothing', () => {
  const report = createReport();
  assert.equal(report.isEmpty(), true);
  assert.deepEqual(report.toLines(), []);
  assert.deepEqual(report.totals(), { created: 0, deleted: 0, failed: 0, skipped: 0, planned: 0 });
});
