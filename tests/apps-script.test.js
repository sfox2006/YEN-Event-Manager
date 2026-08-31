import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');

function contextFor(values = {}) {
  const context = vm.createContext({ console, Utilities: { getUuid: () => 'generated-id' }, ...values });
  vm.runInContext(source, context);
  return context;
}

test('in-memory upsert preserves stable IDs and creation timestamps', () => {
  const rows = [{ event_id: 'event_1', event_name: 'Original', status: 'Idea', created_at: 'created', updated_at: 'old' }];
  const context = contextFor({ rows, update: { event_id: 'event_1', event_name: 'Updated' } });
  const saved = vm.runInContext("upsertInMemory_('Events', rows, update, 'new-time')", context);
  assert.equal(saved.event_id, 'event_1');
  assert.equal(saved.event_name, 'Updated');
  assert.equal(saved.status, 'Idea');
  assert.equal(saved.created_at, 'created');
  assert.equal(saved.updated_at, 'new-time');
  assert.equal(rows.length, 1);
});

test('batched event replacement changes only the selected event', () => {
  const rows = [
    { checklist_id: 'keep_other', event_id: 'event_2', item_name: 'Other event', created_at: 'old' },
    { checklist_id: 'replace_me', event_id: 'event_1', item_name: 'Old item', created_at: 'created' },
    { checklist_id: 'remove_me', event_id: 'event_1', item_name: 'Removed item', created_at: 'created' }
  ];
  const incoming = [{ checklist_id: 'replace_me', item_name: 'Updated item', status: 'Complete' }];
  const context = contextFor({ rows, incoming });
  const result = vm.runInContext("replaceEventRowsInMemory_('Event_Checklist', rows, 'event_1', incoming, 'checklist', 'new-time')", context);
  assert.equal(result.length, 2);
  assert.ok(result.some(row => row.checklist_id === 'keep_other'));
  assert.ok(!result.some(row => row.checklist_id === 'remove_me'));
  const updated = result.find(row => row.checklist_id === 'replace_me');
  assert.equal(updated.item_name, 'Updated item');
  assert.equal(updated.created_at, 'created');
  assert.equal(updated.updated_at, 'new-time');
});

test('event details are assembled from one table snapshot', () => {
  const event = { event_id: 'event_1', event_name: 'Test Event' };
  const tables = {
    Speakers: [{ speaker_id: 'speaker_1', name: 'Speaker One' }],
    Event_Speakers: [{ event_speaker_id: 'link_1', event_id: 'event_1', speaker_id: 'speaker_1', invitation_status: 'Confirmed' }],
    Event_Posters: [{ poster_id: 'poster_1', event_id: 'event_1', title: 'Main poster' }],
    Event_Tasks: [{ task_id: 'task_1', event_id: 'event_1', task_name: 'Book the room', status: 'In progress' }],
    Funding: [], Venues: [],
    Organisations: [{ organisation_id: 'org_1', organisation_name: 'Partner' }],
    Event_Organisations: [{ event_organisation_id: 'org_link_1', event_id: 'event_1', organisation_id: 'org_1' }],
    Event_Attendance: [], Event_Checklist: []
  };
  const context = contextFor({ event, tables });
  const detail = vm.runInContext('buildEventDetail_(event, tables)', context);
  assert.equal(detail.speakers[0].name, 'Speaker One');
  assert.equal(detail.speakers[0].invitation_status, 'Confirmed');
  assert.equal(detail.posters[0].title, 'Main poster');
  assert.equal(detail.tasks[0].task_name, 'Book the room');
  assert.equal(detail.organisations[0].organisation_name, 'Partner');
});

test('task schema supports assignment and progress tracking', () => {
  const context = contextFor();
  const headers = vm.runInContext('SCHEMA.Event_Tasks', context);
  for (const field of ['task_id', 'event_id', 'assignee_member_id', 'due_date', 'priority', 'status']) {
    assert.ok(headers.includes(field));
  }
});

test('task automation schema tracks templates and generated task offsets', () => {
  const context = contextFor();
  const templateHeaders = vm.runInContext('SCHEMA.Task_Templates', context);
  for (const field of ['template_id', 'task_name', 'description', 'assignee_member_id', 'offset_days', 'priority', 'active', 'created_at', 'updated_at']) assert.ok(templateHeaders.includes(field));
  const taskHeaders = vm.runInContext('SCHEMA.Event_Tasks', context);
  assert.ok(taskHeaders.includes('generated_from_template_id'));
  assert.ok(taskHeaders.includes('due_date_offset_days'));
});

test('automated tasks use deadlines before, on and after an event and are not duplicated on retry', () => {
  const tasks = [];
  const event = { event_id: 'event_1', date: '2026-12-01' };
  const templates = [
    { template_id: 'template_before', task_name: 'Before', offset_days: '-90', assignee_member_id: 'active_member' },
    { template_id: 'template_on', task_name: 'On', offset_days: '0', assignee_member_id: 'inactive_member' },
    { template_id: 'template_after', task_name: 'After', offset_days: '2' }
  ];
  const context = contextFor({ tasks, event, templates });
  const first = vm.runInContext("generateAutomatedTasksInMemory_(tasks, event, templates, 'now', ['active_member'])", context);
  const second = vm.runInContext("generateAutomatedTasksInMemory_(tasks, event, templates, 'later', ['active_member'])", context);
  assert.equal(tasks.length, 3);
  assert.equal(first[0].due_date, '2026-09-02');
  assert.equal(first[1].due_date, '2026-12-01');
  assert.equal(first[2].due_date, '2026-12-03');
  assert.equal(first[0].task_id, 'task_auto_event_1_template_before');
  assert.equal(first[0].assignee_member_id, 'active_member');
  assert.equal(first[1].assignee_member_id, '');
  assert.equal(second[0].task_id, first[0].task_id);
});

test('event date changes update only incomplete automated tasks', () => {
  const tasks = [
    { task_id: 'auto_open', event_id: 'event_1', generated_from_template_id: 'template_1', due_date_offset_days: '-30', due_date: '2026-11-01', status: 'In progress', updated_at: 'old' },
    { task_id: 'auto_done', event_id: 'event_1', generated_from_template_id: 'template_2', due_date_offset_days: '-7', due_date: '2026-11-24', status: 'Complete', updated_at: 'old' },
    { task_id: 'manual', event_id: 'event_1', due_date: '2026-11-20', status: 'Not started', updated_at: 'old' },
    { task_id: 'other_event', event_id: 'event_2', generated_from_template_id: 'template_1', due_date_offset_days: '-30', due_date: '2026-11-01', status: 'Not started', updated_at: 'old' }
  ];
  const context = contextFor({ tasks });
  const changed = vm.runInContext("updateAutomatedTaskDeadlinesInMemory_(tasks, 'event_1', '2026-12-15', 'now')", context);
  assert.equal(changed.length, 1);
  assert.equal(tasks[0].due_date, '2026-11-15');
  assert.equal(tasks[0].updated_at, 'now');
  assert.equal(tasks[1].due_date, '2026-11-24');
  assert.equal(tasks[2].due_date, '2026-11-20');
  assert.equal(tasks[3].due_date, '2026-11-01');
});

test('starter templates cover the requested event lifecycle and preserve YEN assignee conventions', () => {
  const tasks = [{ task_name: 'Posters', assignee_member_id: 'member_posters' }];
  const committee = [{ member_id: 'member_posters', role: 'Committee Member', active: 'TRUE' }];
  const context = contextFor({ tasks, committee });
  const definitions = vm.runInContext('DEFAULT_TASK_TEMPLATES', context);
  assert.ok(definitions.length >= 15);
  assert.ok(definitions.some(row => Number(row.offset_days) < 0));
  assert.ok(definitions.some(row => Number(row.offset_days) === 0));
  assert.ok(definitions.some(row => Number(row.offset_days) > 0));
  const posterDefinition = definitions.find(row => row.template_id === 'template_default_posters');
  assert.equal(vm.runInContext('inferTemplateAssignee_(DEFAULT_TASK_TEMPLATES.find(function (row) { return row.template_id === "template_default_posters"; }), tasks, committee)', context), 'member_posters');
  assert.equal(posterDefinition.task_name, 'Posters');
});

test('meeting schema supports scheduling, links and notes', () => {
  const context = contextFor();
  const headers = vm.runInContext('SCHEMA.Meetings', context);
  for (const field of ['meeting_id', 'meeting_name', 'meeting_type', 'date', 'start_time', 'meeting_link', 'organiser_member_id', 'organisation_id', 'external_organisation', 'status', 'agenda', 'notes']) {
    assert.ok(headers.includes(field));
  }
});

test('permanent event deletion removes linked records but preserves other events and shared speakers', () => {
  const tables = {
    Events: [{ event_id: 'event_1' }, { event_id: 'event_2' }],
    Speakers: [{ speaker_id: 'only_event_1' }, { speaker_id: 'shared' }, { speaker_id: 'only_event_2' }],
    Event_Speakers: [
      { event_speaker_id: 'link_1', event_id: 'event_1', speaker_id: 'only_event_1' },
      { event_speaker_id: 'link_2', event_id: 'event_1', speaker_id: 'shared' },
      { event_speaker_id: 'link_3', event_id: 'event_2', speaker_id: 'shared' },
      { event_speaker_id: 'link_4', event_id: 'event_2', speaker_id: 'only_event_2' }
    ],
    Event_Posters: [{ poster_id: 'remove', event_id: 'event_1' }, { poster_id: 'keep', event_id: 'event_2' }],
    Event_Tasks: [{ task_id: 'remove', event_id: 'event_1' }, { task_id: 'keep', event_id: 'event_2' }],
    Event_Attendance: [{ attendance_id: 'remove', event_id: 'event_1' }],
    Event_Organisations: [{ event_organisation_id: 'remove', event_id: 'event_1' }],
    Funding: [{ funding_id: 'remove', event_id: 'event_1' }],
    Venues: [{ venue_id: 'remove', event_id: 'event_1' }],
    Event_Checklist: [{ checklist_id: 'remove', event_id: 'event_1' }]
  };
  const context = contextFor({ tables });
  vm.runInContext("deleteEventFromTables_(tables, 'event_1')", context);
  assert.deepEqual(tables.Events.map(row => row.event_id), ['event_2']);
  assert.deepEqual(tables.Event_Tasks.map(row => row.task_id), ['keep']);
  assert.deepEqual(tables.Event_Posters.map(row => row.poster_id), ['keep']);
  assert.ok(!tables.Speakers.some(row => row.speaker_id === 'only_event_1'));
  assert.ok(tables.Speakers.some(row => row.speaker_id === 'shared'));
  for (const name of ['Event_Attendance', 'Event_Organisations', 'Funding', 'Venues', 'Event_Checklist']) assert.equal(tables[name].length, 0);
});
