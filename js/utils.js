export const STATUSES = {
  event: ['Idea', 'Planning', 'Confirmed', 'Registrations Open', 'Completed', 'Cancelled'],
  attendance: ['Confirmed attending', 'Likely attending', 'Awaiting response', 'Not attending', 'Not asked'],
  speaker: ['Not contacted', 'Invitation to be sent', 'Invited', 'Follow-up required', 'Confirmed', 'Declined', 'Withdrawn'],
  poster: ['Draft requested', 'In progress', 'Ready for review', 'Approved', 'Published', 'Not required'],
  room: ['Not started', 'Requested', 'Tentatively booked', 'Confirmed', 'Not required'],
  checklist: ['Not started', 'In progress', 'Complete', 'Not applicable'],
  funding: ['No', 'Pending', 'Confirmed', 'N/A']
};

export const CHECKLIST_ITEMS = [
  ['Registration', 'Registration required'],
  ['Registration', 'Registration page created'],
  ['Registration', 'Registrations open'],
  ['Marketing', 'Event graphic/poster'],
  ['Marketing', 'Email promotion'],
  ['Marketing', 'Social media promotion'],
  ['Marketing', 'Partner promotion'],
  ['Operations', 'AV requirements confirmed'],
  ['Operations', 'Catering required'],
  ['Operations', 'Catering confirmed'],
  ['Operations', 'Photographer required'],
  ['Operations', 'Name tags required'],
  ['Operations', 'Run sheet completed']
];

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

export function formatDate(value) {
  if (!value) return 'Date TBC';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function eventBucket(event, today = new Date()) {
  if (event.status === 'Cancelled') return 'cancelled';
  if (event.status === 'Completed') return 'past';
  if (!event.date) return 'upcoming';
  const eventDate = new Date(`${event.date}T23:59:59`);
  return eventDate < today ? 'past' : 'upcoming';
}

export function progressFor(detail) {
  const checks = [];
  const add = (applicable, done) => { if (applicable) checks.push(Boolean(done)); };
  add(true, Boolean(detail.event?.date));
  add(true, Boolean(detail.event?.lead_organiser_id));
  add(detail.event?.funding_required !== 'No', detail.event?.funding_required === 'No' || detail.funding?.some(f => ['Confirmed', 'N/A'].includes(f.status)));
  add(detail.event?.room_required !== 'No', detail.event?.room_required === 'No' || ['Confirmed', 'Not required'].includes(detail.venue?.booking_status));
  const relevantSpeakers = (detail.speakers || []).filter(s => !['Declined', 'Withdrawn'].includes(s.invitation_status));
  add(relevantSpeakers.length > 0, relevantSpeakers.length > 0 && relevantSpeakers.every(s => s.invitation_status === 'Confirmed'));
  for (const item of detail.checklist || []) add(item.status !== 'Not applicable', item.status === 'Complete');
  return checks.length ? Math.round((checks.filter(Boolean).length / checks.length) * 100) : 0;
}

export function speakerSummary(speakers = []) {
  const active = speakers.filter(s => !['Declined', 'Withdrawn'].includes(s.invitation_status));
  return `${active.filter(s => s.invitation_status === 'Confirmed').length}/${active.length}`;
}

export function attendanceSummary(attendance = []) {
  const count = status => attendance.filter(a => a.attendance_status === status).length;
  return `${count('Confirmed attending')} confirmed, ${count('Awaiting response')} awaiting, ${count('Not attending')} unavailable`;
}

export function statusTone(value = '') {
  const text = String(value).toLowerCase();
  if (/confirmed|complete|registrations open|attending/.test(text) && !/not /.test(text)) return 'success';
  if (/pending|planning|requested|likely|awaiting|invited|progress|idea|tentative/.test(text)) return 'warning';
  if (/declined|cancelled|not started|follow-up|no$|not attending/.test(text)) return 'danger';
  return 'neutral';
}

export function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export function optionList(values, selected = '') {
  return values.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
}
