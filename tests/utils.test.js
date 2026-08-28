import test from 'node:test';
import assert from 'node:assert/strict';
import { eventBucket, meetingBucket, progressFor, speakerSummary, attendanceSummary, escapeHtml } from '../js/utils.js';

test('past, upcoming and cancelled events are classified without deleting history', () => {
  const now = new Date('2026-08-24T12:00:00');
  assert.equal(eventBucket({ date: '2026-08-25', status: 'Planning' }, now), 'upcoming');
  assert.equal(eventBucket({ date: '2026-08-23', status: 'Planning' }, now), 'past');
  assert.equal(eventBucket({ date: '2026-08-25', status: 'Cancelled' }, now), 'cancelled');
  assert.equal(eventBucket({ date: '', status: 'Idea' }, now), 'upcoming');
});

test('meetings are classified as upcoming, past or cancelled', () => {
  const now = new Date('2026-08-24T12:00:00');
  assert.equal(meetingBucket({ date: '2026-08-25', status: 'Planned' }, now), 'upcoming');
  assert.equal(meetingBucket({ date: '2026-08-23', status: 'Planned' }, now), 'past');
  assert.equal(meetingBucket({ date: '2026-08-25', status: 'Cancelled' }, now), 'cancelled');
  assert.equal(meetingBucket({ date: '', status: 'Planned' }, now), 'upcoming');
});

test('speaker summary derives confirmed count from individual records', () => {
  const speakers = [
    { invitation_status: 'Confirmed' },
    { invitation_status: 'Confirmed' },
    { invitation_status: 'Invited' },
    { invitation_status: 'Declined' }
  ];
  assert.equal(speakerSummary(speakers), '2/3');
});

test('not-applicable checklist and requirements do not reduce readiness', () => {
  const detail = {
    event: { date: '2026-10-10', lead_organiser_id: 'member_1', funding_required: 'No', room_required: 'No' },
    funding: [], venue: {}, speakers: [],
    checklist: [{ status: 'Complete' }, { status: 'Not applicable' }]
  };
  assert.equal(progressFor(detail), 100);
});

test('readiness remains transparent when applicable tasks are incomplete', () => {
  const detail = {
    event: { date: '2026-10-10', lead_organiser_id: '', funding_required: 'Yes', room_required: 'Yes' },
    funding: [{ status: 'Confirmed' }],
    venue: { booking_status: 'Requested' },
    speakers: [{ invitation_status: 'Confirmed' }, { invitation_status: 'Invited' }],
    checklist: [{ status: 'Complete' }, { status: 'In progress' }]
  };
  assert.equal(progressFor(detail), 43);
});

test('attendance summary reports confirmed, awaiting and unavailable', () => {
  const rows = [
    { attendance_status: 'Confirmed attending' },
    { attendance_status: 'Confirmed attending' },
    { attendance_status: 'Awaiting response' },
    { attendance_status: 'Not attending' }
  ];
  assert.equal(attendanceSummary(rows), '2 confirmed, 1 awaiting, 1 unavailable');
});

test('HTML escaping protects dynamic values', () => {
  assert.equal(escapeHtml('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
});
