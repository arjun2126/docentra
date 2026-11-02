import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectNext } from '../next-task.mjs';

const task = (id, status, dependsOn = []) => ({ id, title: id, status, dependsOn });
const state = (tasks) => ({ schemaVersion: 1, tasks });

test('selects the first pending task whose dependencies are done', () => {
  const selection = selectNext(state([task('A', 'done'), task('B', 'pending', ['A']), task('C', 'pending', ['B'])]));
  assert.equal(selection.kind, 'task');
  assert.equal(selection.task.id, 'B');
});

test('never selects a task whose dependency is unfinished', () => {
  const selection = selectNext(state([task('A', 'pending', ['B']), task('B', 'pending', ['A'])]));
  assert.equal(selection.kind, 'none');
});

test('never selects a task whose dependency is blocked', () => {
  const selection = selectNext(state([task('A', 'blocked'), task('B', 'pending', ['A'])]));
  assert.equal(selection.kind, 'blocked');
  assert.equal(selection.task.id, 'A');
  assert.deepEqual(selection.stranded, ['B']);
});

test('resumes an in-flight task instead of starting a new one', () => {
  const selection = selectNext(state([task('A', 'in_progress'), task('B', 'pending')]));
  assert.equal(selection.kind, 'resume');
  assert.equal(selection.task.id, 'A');
});

test('independent ready work proceeds while an approval gate is open', () => {
  const selection = selectNext(state([task('B', 'pending'), task('GATE', 'awaiting_approval')]));
  assert.equal(selection.kind, 'task');
  assert.equal(selection.task.id, 'B');
});

test('an approval gate is reported once it is the only thing preventing progress', () => {
  const selection = selectNext(state([task('GATE', 'awaiting_approval'), task('B', 'pending', ['GATE'])]));
  assert.equal(selection.kind, 'awaiting_approval');
  assert.equal(selection.task.id, 'GATE');
});

test('reports none when every task is done', () => {
  assert.equal(selectNext(state([task('A', 'done'), task('B', 'done')])).kind, 'none');
});

test('selection is deterministic across repeated calls', () => {
  const input = state([task('A', 'done'), task('B', 'pending', ['A']), task('C', 'pending', ['A'])]);
  assert.equal(selectNext(input).task.id, selectNext(input).task.id);
});
