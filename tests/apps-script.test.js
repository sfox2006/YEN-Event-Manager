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
  assert.equal(detail.organisations[0].organisation_name, 'Partner');
});

