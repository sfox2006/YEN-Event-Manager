import { api, isConfigured } from './api.js';
import { STATUSES, CHECKLIST_ITEMS, escapeHtml, formatDate, eventBucket, meetingBucket, progressFor, speakerSummary, attendanceSummary, statusTone, formObject, optionList } from './utils.js';

const app = document.querySelector('#app');
const nav = document.querySelector('#main-nav');
const navToggle = document.querySelector('.nav-toggle');
const state = { bootstrap: null, event: null, filter: 'upcoming', meetingFilter: 'upcoming', taskMemberFilter: '' };

const badge = value => `<span class="badge badge-${statusTone(value)}">${escapeHtml(value || 'Not set')}</span>`;
const uid = prefix => `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;

navToggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(open));
});

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', event => {
  if (document.querySelector('form[data-dirty="true"]')) { event.preventDefault(); event.returnValue = ''; }
});

function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.querySelector('#toast-region').append(el);
  setTimeout(() => el.remove(), 3500);
}

function cacheEventDetail(detail) {
  if (!state.bootstrap || !detail?.event) return;
  const event = detail.event;
  const fundingStatuses = ['Confirmed', 'Pending', 'No', 'N/A'];
  const fundingStatus = fundingStatuses.find(status => (detail.funding || []).some(row => row.status === status)) || (event.funding_required === 'No' ? 'N/A' : 'Not started');
  const lead = (state.bootstrap.committee || []).find(member => member.member_id === event.lead_organiser_id);
  const summary = {
    ...event,
    progress: progressFor(detail),
    funding_status: fundingStatus,
    speaker_summary: speakerSummary(detail.speakers || []),
    room_status: detail.venue?.booking_status || (event.room_required === 'No' ? 'Not required' : 'Not started'),
    committee_confirmed: (detail.attendance || []).filter(row => row.attendance_status === 'Confirmed attending').length,
    lead_organiser_name: lead?.name || '',
    organisation_ids: (detail.organisations || []).map(row => row.organisation_id)
  };
  state.bootstrap.events = (state.bootstrap.events || []).filter(row => row.event_id !== event.event_id).concat(summary);
}

function setActiveNav(routeName) {
  document.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === routeName));
  nav.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
}

function loading(label = 'Loading shared event data…') {
  app.innerHTML = `<div class="loading-state"><span class="spinner" aria-hidden="true"></span><p>${escapeHtml(label)}</p></div>`;
}

function errorView(error, retry = 'route()') {
  app.innerHTML = `<div class="error-state"><h2>We couldn’t load this page</h2><p>${escapeHtml(error.message)}</p><button class="btn btn-primary" onclick="${retry}">Retry</button></div>`;
}

function configNotice() {
  return isConfigured() ? '' : `<div class="config-notice"><strong>Shared data service not connected yet</strong>Deploy the supplied Apps Script, then paste its web-app URL into <code>js/config.js</code>. The interface is ready, but saving and loading shared records require that one deployment step. See the README for exact instructions.</div>`;
}

async function ensureBootstrap(force = false) {
  if (state.bootstrap && !force) return state.bootstrap;
  state.bootstrap = await api.getBootstrap();
  return state.bootstrap;
}

async function route() {
  const [, routeName = 'dashboard', id] = location.hash.split('/');
  setActiveNav(routeName === 'event' ? 'events' : routeName);
  loading();
  if (!isConfigured()) {
    state.bootstrap ||= { events: [], committee: [], organisations: [], meetings: [], tasks: [] };
  } else {
    try { await ensureBootstrap(); } catch (error) { errorView(error); return; }
  }
  try {
    if (routeName === 'events') renderEvents();
    else if (routeName === 'event' && id) await renderEventDetail(id);
    else if (routeName === 'meetings') renderMeetings();
    else if (routeName === 'tasks') renderTasks();
    else if (routeName === 'committee') renderCommittee();
    else if (routeName === 'organisations') renderOrganisations();
    else renderDashboard();
    app.focus();
  } catch (error) { errorView(error); }
}
window.route = route;

function renderDashboard() {
  const events = (state.bootstrap.events || []).filter(event => eventBucket(event) === 'upcoming').sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const confirmed = events.filter(event => ['Confirmed', 'Registrations Open'].includes(event.status)).length;
  const actionNeeded = events.filter(event => (event.progress || 0) < 50).length;
  const openTasks = (state.bootstrap.tasks || []).filter(task => task.status !== 'Complete');
  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = openTasks.filter(task => task.due_date && task.due_date < today);
  const upcomingMeetings = (state.bootstrap.meetings || []).filter(meeting => meetingBucket(meeting) === 'upcoming').sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  app.innerHTML = `${configNotice()}
    <header class="page-header"><div><h1>Dashboard</h1><p>Where are we at with each event?</p></div><div class="header-actions"><button class="btn btn-primary" id="add-event">+ Add Event</button></div></header>
    <section class="summary-grid" aria-label="Event summary">
      <div class="metric"><strong>${events.length}</strong><span>Upcoming events</span></div>
      <div class="metric"><strong>${confirmed}</strong><span>Confirmed or open</span></div>
      <div class="metric"><strong>${actionNeeded}</strong><span>Below 50% readiness</span></div>
      <div class="metric"><strong>${events.reduce((sum, e) => sum + Number(e.committee_confirmed || 0), 0)}</strong><span>Confirmed attendances</span></div>
      <div class="metric"><strong>${openTasks.length}</strong><span>Open committee tasks</span></div>
      <div class="metric"><strong>${overdueTasks.length}</strong><span>Overdue tasks</span></div>
      <div class="metric"><strong>${upcomingMeetings.length}</strong><span>Upcoming meetings</span></div>
    </section>
    <section class="panel"><div class="panel-header"><h2>Upcoming events</h2><a href="#/events">View all events</a></div>
      ${events.length ? eventTable(events) : `<div class="empty-state"><h2>No upcoming events yet</h2><p>Create an event to start tracking preparations.</p><button class="btn btn-primary" id="empty-add-event">+ Add Event</button></div>`}
    </section>
    <section class="panel"><div class="panel-header"><h2>Next meetings</h2><a href="#/meetings">View all meetings</a></div>
      ${upcomingMeetings.length ? meetingTable(upcomingMeetings.slice(0, 5), false) : `<div class="empty-state"><h2>No meetings scheduled</h2><p>Add a committee meeting to keep everyone aligned.</p><a class="btn btn-primary" href="#/meetings">Go to meetings</a></div>`}
    </section>`;
  document.querySelector('#add-event')?.addEventListener('click', openEventDialog);
  document.querySelector('#empty-add-event')?.addEventListener('click', openEventDialog);
  wireEventRows();
}

function eventTable(events) {
  return `<div class="table-wrap"><table class="responsive"><thead><tr><th>Event</th><th>Date & time</th><th>Progress</th><th>Funding</th><th>Speakers</th><th>Room</th><th>Committee</th><th>Lead</th></tr></thead><tbody>
    ${events.map(event => `<tr class="clickable" data-event-id="${escapeHtml(event.event_id)}" tabindex="0">
      <td data-label="Event"><span class="event-name">${escapeHtml(event.event_name)}</span><div class="subtle">${escapeHtml(event.status || 'Idea')}</div></td>
      <td data-label="Date & time">${formatDate(event.date)}<div class="subtle">${escapeHtml(event.start_time || 'Time TBC')}</div></td>
      <td data-label="Progress"><div class="progress-label"><div class="progress" aria-label="${Number(event.progress || 0)} percent"><span style="width:${Number(event.progress || 0)}%"></span></div>${Number(event.progress || 0)}%</div></td>
      <td data-label="Funding">${badge(event.funding_status || (event.funding_required === 'No' ? 'N/A' : 'Not started'))}</td>
      <td data-label="Speakers">${badge(event.speaker_summary || '0/0')}</td>
      <td data-label="Room">${badge(event.room_status || (event.room_required === 'No' ? 'Not required' : 'Not started'))}</td>
      <td data-label="Committee">${Number(event.committee_confirmed || 0)} confirmed</td>
      <td data-label="Lead">${escapeHtml(event.lead_organiser_name || 'Unassigned')}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function wireEventRows() {
  document.querySelectorAll('[data-event-id]').forEach(row => {
    const go = () => { location.hash = `#/event/${row.dataset.eventId}`; };
    row.addEventListener('click', go);
    row.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) go(); });
  });
}

function renderEvents() {
  app.innerHTML = `${configNotice()}<header class="page-header"><div><h1>Events</h1><p>Plan new events and keep the full history accessible.</p></div><button class="btn btn-primary" id="add-event">+ Add Event</button></header>
    <div class="tabs" role="tablist">${['upcoming', 'past', 'cancelled'].map(tab => `<button data-filter="${tab}" class="${state.filter === tab ? 'active' : ''}">${tab[0].toUpperCase() + tab.slice(1)}</button>`).join('')}</div>
    <div class="toolbar"><label>Search<input id="event-search" type="search" placeholder="Search event name"></label><label>Status<select id="event-status"><option value="">All statuses</option>${optionList(STATUSES.event)}</select></label><label>Lead organiser<select id="event-lead"><option value="">All organisers</option>${(state.bootstrap.committee || []).map(m => `<option value="${m.member_id}">${escapeHtml(m.name)}</option>`).join('')}</select></label><label>Organisation<select id="event-org"><option value="">All organisations</option>${(state.bootstrap.organisations || []).map(o => `<option value="${o.organisation_id}">${escapeHtml(o.organisation_name)}</option>`).join('')}</select></label></div>
    <section class="panel" id="event-list"></section>`;
  const update = () => {
    const search = document.querySelector('#event-search').value.toLowerCase();
    const status = document.querySelector('#event-status').value;
    const lead = document.querySelector('#event-lead').value;
    const org = document.querySelector('#event-org').value;
    const events = (state.bootstrap.events || []).filter(e => eventBucket(e) === state.filter && e.event_name.toLowerCase().includes(search) && (!status || e.status === status) && (!lead || e.lead_organiser_id === lead) && (!org || (e.organisation_ids || []).includes(org)));
    document.querySelector('#event-list').innerHTML = events.length ? eventTable(events) : `<div class="empty-state"><h2>No matching events</h2><p>Try clearing a filter or add a new event.</p></div>`;
    wireEventRows();
  };
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { state.filter = button.dataset.filter; renderEvents(); }));
  ['#event-search', '#event-status', '#event-lead', '#event-org'].forEach(selector => document.querySelector(selector).addEventListener('input', update));
  document.querySelector('#add-event').addEventListener('click', openEventDialog);
  update();
}

function eventFields(event = {}) {
  const activeCommittee = (state.bootstrap.committee || []).filter(m => String(m.active).toLowerCase() !== 'false');
  return `<div class="form-grid cols-3">
    <label class="field-span">Event name<input name="event_name" required value="${escapeHtml(event.event_name)}"></label>
    <label class="field-span">Description<textarea name="description">${escapeHtml(event.description)}</textarea></label>
    <label>Event type<input name="event_type" value="${escapeHtml(event.event_type)}" placeholder="Panel, networking, workshop…"></label>
    <label>Status<select name="status">${optionList(STATUSES.event, event.status || 'Idea')}</select></label>
    <label>Lead organiser<select name="lead_organiser_id"><option value="">Unassigned</option>${activeCommittee.map(m => `<option value="${m.member_id}" ${m.member_id === event.lead_organiser_id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}</select></label>
    <label>Date<input name="date" type="date" value="${escapeHtml(event.date)}"></label>
    <label>Start time<input name="start_time" type="time" value="${escapeHtml(event.start_time)}"></label>
    <label>End time<input name="end_time" type="time" value="${escapeHtml(event.end_time)}"></label>
    <label>Funding required<select name="funding_required">${optionList(['Unknown', 'Yes', 'No'], event.funding_required || 'Unknown')}</select></label>
    <label>Room required<select name="room_required">${optionList(['Unknown', 'Yes', 'No'], event.room_required || 'Unknown')}</select></label>
    <label class="field-span">Notes<textarea name="notes">${escapeHtml(event.notes)}</textarea></label>
  </div>`;
}

function openEventDialog() {
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `<form method="dialog" id="new-event-form"><div class="dialog-header"><h2>Add event</h2><button class="icon-btn" value="cancel" aria-label="Close">✕</button></div><div class="dialog-body">${eventFields()}<div class="form-actions"><span class="save-state">Only the event name is required.</span><button class="btn btn-secondary" value="cancel">Cancel</button><button class="btn btn-primary" value="default" id="create-event">Create event</button></div></div></form>`;
  document.body.append(dialog); dialog.showModal();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('#new-event-form').addEventListener('submit', async event => {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault();
    const button = dialog.querySelector('#create-event'); button.disabled = true; button.textContent = 'Saving…';
    try {
      const saved = await api.saveEvent(formObject(event.currentTarget));
      cacheEventDetail({ event: saved, funding: [], speakers: [], venue: {}, organisations: [], attendance: [], checklist: [] });
      dialog.close(); toast('Event created and saved.'); location.hash = `#/event/${saved.event_id}`;
    } catch (error) { button.disabled = false; button.textContent = 'Create event'; dialog.querySelector('.save-state').textContent = error.message; dialog.querySelector('.save-state').classList.add('error'); }
  });
}

async function renderEventDetail(id) {
  loading('Loading event details…');
  state.event = await api.getEvent(id);
  const d = state.event;
  const event = d.event;
  app.innerHTML = `<header class="page-header"><div><a href="#/events">← All events</a><h1>${escapeHtml(event.event_name)}</h1><p>${formatDate(event.date)} · ${escapeHtml(event.start_time || 'Time TBC')} · ${escapeHtml(event.status)}</p></div><div class="header-actions">${badge(`${progressFor(d)}% ready`)}</div></header>
    <div class="detail-layout"><form id="event-detail-form">
      ${panel('basic', 'Basic details', eventFields(event))}
      ${panel('funding', 'Funding', fundingFields(d.funding || []))}
      ${panel('speakers', `Speakers — ${speakerSummary(d.speakers)}`, speakerFields(d.speakers || []))}
      ${panel('posters', 'Posters', posterFields(d.posters || []))}
      ${panel('venue', 'Room / venue', venueFields(d.venue || {}))}
      ${panel('organisations', 'Organisations involved', organisationFields(d.organisations || []))}
      ${panel('attendance', `Committee attendance — ${attendanceSummary(d.attendance)}`, attendanceFields(d.attendance || []))}
      ${panel('event-tasks', 'Tasks', eventTaskFields(d.tasks || [], event.event_id))}
      ${panel('checklist', 'Event checklist', checklistFields(d.checklist || []))}
      <div class="panel"><div class="panel-body"><div class="form-actions"><span class="save-state" id="save-state">No unsaved changes.</span><button class="btn btn-primary" type="submit" id="save-event">Save all changes</button></div></div></div>
    </form><aside class="detail-nav" aria-label="Event sections">${['basic','funding','speakers','posters','venue','organisations','attendance','event-tasks','checklist'].map(s => `<a href="#${s}">${s === 'event-tasks' ? 'Tasks' : s[0].toUpperCase()+s.slice(1)}</a>`).join('')}</aside></div>`;
  wireDetailForm();
  wireEventTaskPanel();
}

function panel(id, title, body) { return `<section class="panel" id="${id}"><div class="panel-header"><h2>${title}</h2></div><div class="panel-body">${body}</div></section>`; }

function fundingFields(rows) {
  return `<div id="funding-rows" class="repeater">${rows.map(fundingRow).join('')}</div><button type="button" class="btn btn-secondary" data-add="funding">+ Add funding source</button>`;
}
function fundingRow(row = {}) {
  return `<div class="repeat-row" data-kind="funding" data-id="${escapeHtml(row.funding_id || uid('funding'))}"><div class="repeat-row-grid"><label>Source<input data-field="source_name" value="${escapeHtml(row.source_name)}"></label><label>Status<select data-field="status">${optionList(STATUSES.funding, row.status || 'Pending')}</select></label><label>Requested (AUD)<input data-field="amount_requested" type="number" min="0" step="0.01" value="${escapeHtml(row.amount_requested)}"></label><label>Confirmed (AUD)<input data-field="amount_confirmed" type="number" min="0" step="0.01" value="${escapeHtml(row.amount_confirmed)}"></label><button type="button" class="icon-btn" data-remove aria-label="Remove funding source">Remove</button><label class="field-span">Notes<input data-field="notes" value="${escapeHtml(row.notes)}"></label></div></div>`;
}

function speakerFields(rows) {
  return `<div id="speaker-rows" class="repeater">${rows.map(speakerRow).join('')}</div><button type="button" class="btn btn-secondary" data-add="speaker">+ Add speaker</button>`;
}
function speakerRow(row = {}) {
  return `<div class="repeat-row" data-kind="speaker" data-id="${escapeHtml(row.event_speaker_id || uid('event_speaker'))}" data-speaker-id="${escapeHtml(row.speaker_id || uid('speaker'))}"><div class="repeat-row-grid"><label>Name<input data-field="name" value="${escapeHtml(row.name)}"></label><label>Organisation<input data-field="organisation_name" value="${escapeHtml(row.organisation_name)}"></label><label>Title / position<input data-field="title" value="${escapeHtml(row.title)}"></label><label>Status<select data-field="invitation_status">${optionList(STATUSES.speaker, row.invitation_status || 'Not contacted')}</select></label><button type="button" class="icon-btn" data-remove aria-label="Remove speaker">Remove</button><label>Email<input data-field="email" type="email" value="${escapeHtml(row.email)}"></label><label class="field-span">Notes<input data-field="notes" value="${escapeHtml(row.notes)}"></label></div></div>`;
}

function posterFields(rows) {
  return `<p class="subtle">Paste a shareable Google Drive link for each event poster. Ensure the Drive file's sharing permissions allow the intended committee members to open it.</p><div id="poster-rows" class="repeater">${rows.map(posterRow).join('')}</div><button type="button" class="btn btn-secondary" data-add="poster">+ Add poster link</button>`;
}
function posterRow(row = {}) {
  const link = /^https:\/\//.test(row.drive_url || '') ? `<a href="${escapeHtml(row.drive_url)}" target="_blank" rel="noopener noreferrer">Open poster ↗</a>` : '';
  return `<div class="repeat-row" data-kind="poster" data-id="${escapeHtml(row.poster_id || uid('poster'))}"><div class="repeat-row-grid"><label>Poster title<input data-field="title" value="${escapeHtml(row.title)}" placeholder="Main event poster"></label><label>Google Drive link<input data-field="drive_url" type="url" value="${escapeHtml(row.drive_url)}" placeholder="https://drive.google.com/…">${link}</label><label>Status<select data-field="status">${optionList(STATUSES.poster, row.status || 'Draft requested')}</select></label><label>Notes<input data-field="notes" value="${escapeHtml(row.notes)}"></label><button type="button" class="icon-btn" data-remove aria-label="Remove poster link">Remove</button></div></div>`;
}

function venueFields(venue) {
  return `<div class="form-grid cols-3" data-kind="venue" data-id="${escapeHtml(venue.venue_id || uid('venue'))}"><label>Venue<input data-field="venue" value="${escapeHtml(venue.venue)}"></label><label>Room<input data-field="room" value="${escapeHtml(venue.room)}"></label><label>Booking status<select data-field="booking_status">${optionList(STATUSES.room, venue.booking_status || 'Not started')}</select></label><label>Capacity<input data-field="capacity" type="number" min="0" value="${escapeHtml(venue.capacity)}"></label><label class="field-span">Address<input data-field="address" value="${escapeHtml(venue.address)}"></label><label class="field-span">Venue notes<textarea data-field="notes">${escapeHtml(venue.notes)}</textarea></label></div>`;
}

function organisationFields(rows) {
  const orgs = (state.bootstrap.organisations || []).filter(o => String(o.active).toLowerCase() !== 'false');
  return `<div id="organisation-rows" class="repeater">${rows.map(organisationRow).join('')}</div><button type="button" class="btn btn-secondary" data-add="organisation">+ Associate organisation</button><p class="subtle">Create new directory entries on the Organisations page first.</p>`;
  function organisationRow(row = {}) { return `<div class="repeat-row" data-kind="organisation" data-id="${escapeHtml(row.event_organisation_id || uid('event_organisation'))}"><div class="repeat-row-grid"><label>Organisation<select data-field="organisation_id"><option value="">Select…</option>${orgs.map(o => `<option value="${o.organisation_id}" ${o.organisation_id === row.organisation_id ? 'selected' : ''}>${escapeHtml(o.organisation_name)}</option>`).join('')}</select></label><label>Relationship<select data-field="relationship_type">${optionList(['Organiser','Co-host','Sponsor','Venue partner','Promotional partner','Other'], row.relationship_type || 'Other')}</select></label><button type="button" class="icon-btn" data-remove>Remove</button></div></div>`; }
}

function attendanceFields(rows) {
  const existing = new Map(rows.map(row => [row.member_id, row]));
  const members = (state.bootstrap.committee || []).filter(m => String(m.active).toLowerCase() !== 'false' || existing.has(m.member_id));
  return `<div id="attendance-rows">${members.map(member => { const row = existing.get(member.member_id) || {}; return `<div class="attendance-row" data-kind="attendance" data-id="${escapeHtml(row.attendance_id || uid('attendance'))}" data-member-id="${escapeHtml(member.member_id)}"><div><strong>${escapeHtml(member.name)}</strong><div class="subtle">${escapeHtml(member.role || '')}</div></div><select data-field="attendance_status" aria-label="${escapeHtml(member.name)} attendance">${optionList(STATUSES.attendance, row.attendance_status || 'Not asked')}</select><input data-field="event_role" value="${escapeHtml(row.event_role)}" placeholder="Event role" aria-label="Event role"><input data-field="notes" value="${escapeHtml(row.notes)}" placeholder="Notes" aria-label="Attendance notes"></div>`; }).join('')}</div>`;
}

function checklistFields(rows) {
  const existing = new Map(rows.map(row => [`${row.item_type}|${row.item_name}`, row]));
  const all = CHECKLIST_ITEMS.map(([type, name]) => existing.get(`${type}|${name}`) || { checklist_id: uid('checklist'), item_type: type, item_name: name, status: 'Not started', notes: '' });
  const groups = [...new Set(all.map(row => row.item_type))];
  const registration = `<div class="form-grid cols-3"><label class="field-span">Registration link<input name="registration_link" type="url" value="${escapeHtml(state.event.event.registration_link)}" placeholder="https://…"></label><label>Current registrations<input name="registration_numbers" type="number" min="0" value="${escapeHtml(state.event.event.registration_numbers)}"></label><label>Registration capacity<input name="registration_capacity" type="number" min="0" value="${escapeHtml(state.event.event.registration_capacity)}"></label></div>`;
  return registration + groups.map(group => `<div class="checklist-group"><h3>${escapeHtml(group)}</h3>${all.filter(row => row.item_type === group).map(row => `<div class="checklist-row" data-kind="checklist" data-id="${escapeHtml(row.checklist_id)}" data-type="${escapeHtml(row.item_type)}" data-name="${escapeHtml(row.item_name)}"><strong>${escapeHtml(row.item_name)}</strong><select data-field="status">${optionList(STATUSES.checklist, row.status)}</select><input data-field="notes" value="${escapeHtml(row.notes)}" placeholder="Notes (optional)"></div>`).join('')}</div>`).join('');
}

function cacheMeeting(meeting) {
  state.bootstrap.meetings = (state.bootstrap.meetings || []).filter(row => row.meeting_id !== meeting.meeting_id).concat(meeting);
}

function removeCachedMeeting(meetingId) {
  state.bootstrap.meetings = (state.bootstrap.meetings || []).filter(row => row.meeting_id !== meetingId);
}

function renderMeetings() {
  const meetings = state.bootstrap.meetings || [];
  const upcoming = meetings.filter(meeting => meetingBucket(meeting) === 'upcoming');
  const today = new Date().toISOString().slice(0, 10);
  app.innerHTML = `${configNotice()}<header class="page-header"><div><h1>Meetings</h1><p>Schedule committee meetings and keep agendas, links and notes together.</p></div><button class="btn btn-primary" id="add-meeting">+ Add meeting</button></header>
    <section class="summary-grid meeting-summary" aria-label="Meeting summary"><div class="metric"><strong>${upcoming.length}</strong><span>Upcoming</span></div><div class="metric"><strong>${upcoming.filter(meeting => meeting.date === today).length}</strong><span>Today</span></div><div class="metric"><strong>${meetings.filter(meeting => meeting.status === 'Completed').length}</strong><span>Completed</span></div><div class="metric"><strong>${meetings.filter(meeting => meeting.status === 'Cancelled').length}</strong><span>Cancelled</span></div></section>
    <div class="tabs" role="tablist">${['upcoming', 'past', 'cancelled'].map(tab => `<button data-meeting-filter="${tab}" class="${state.meetingFilter === tab ? 'active' : ''}">${tab[0].toUpperCase() + tab.slice(1)}</button>`).join('')}</div>
    <div class="toolbar meeting-toolbar"><label>Search<input id="meeting-search" type="search" placeholder="Search meetings"></label><label>Meeting type<select id="meeting-type-filter"><option value="">All meeting types</option>${optionList(STATUSES.meetingType)}</select></label><label>Organiser<select id="meeting-organiser-filter"><option value="">All organisers</option>${(state.bootstrap.committee || []).map(member => `<option value="${member.member_id}">${escapeHtml(member.name)}</option>`).join('')}</select></label><label>Status<select id="meeting-status-filter"><option value="">All statuses</option>${optionList(STATUSES.meeting)}</select></label></div>
    <section class="panel" id="meeting-list"></section>`;
  const update = () => {
    const search = document.querySelector('#meeting-search').value.toLowerCase();
    const type = document.querySelector('#meeting-type-filter').value;
    const organiser = document.querySelector('#meeting-organiser-filter').value;
    const status = document.querySelector('#meeting-status-filter').value;
    const filtered = meetings.filter(meeting => meetingBucket(meeting) === state.meetingFilter && `${meeting.meeting_name || ''} ${meeting.location || ''} ${meeting.agenda || ''}`.toLowerCase().includes(search) && (!type || meeting.meeting_type === type) && (!organiser || meeting.organiser_member_id === organiser) && (!status || meeting.status === status));
    document.querySelector('#meeting-list').innerHTML = filtered.length ? meetingTable(filtered) : `<div class="empty-state"><h2>No matching meetings</h2><p>Add a meeting or adjust the filters.</p></div>`;
    wireMeetingRows();
  };
  document.querySelector('#add-meeting').addEventListener('click', () => openMeetingDialog());
  document.querySelectorAll('[data-meeting-filter]').forEach(button => button.addEventListener('click', () => { state.meetingFilter = button.dataset.meetingFilter; renderMeetings(); }));
  ['#meeting-search', '#meeting-type-filter', '#meeting-organiser-filter', '#meeting-status-filter'].forEach(selector => document.querySelector(selector).addEventListener('input', update));
  update();
}

function meetingTable(meetings, includeActions = true) {
  const members = state.bootstrap.committee || [];
  const sorted = [...meetings].sort((a, b) => {
    const direction = state.meetingFilter === 'past' ? -1 : 1;
    return direction * `${a.date || '9999'} ${a.start_time || ''}`.localeCompare(`${b.date || '9999'} ${b.start_time || ''}`);
  });
  return `<div class="table-wrap"><table class="responsive"><thead><tr><th>Meeting</th><th>Date & time</th><th>Location / link</th><th>Organiser</th><th>Status</th>${includeActions ? '<th>Actions</th>' : ''}</tr></thead><tbody>${sorted.map(meeting => {
    const organiser = members.find(member => member.member_id === meeting.organiser_member_id);
    const link = /^https:\/\//.test(meeting.meeting_link || '') ? `<a href="${escapeHtml(meeting.meeting_link)}" target="_blank" rel="noopener noreferrer">Join meeting ↗</a>` : '';
    const status = includeActions ? `<select class="meeting-status-select" data-meeting-status="${escapeHtml(meeting.meeting_id)}">${optionList(STATUSES.meeting, meeting.status || 'Scheduled')}</select>` : badge(meeting.status || 'Scheduled');
    return `<tr><td data-label="Meeting"><strong>${escapeHtml(meeting.meeting_name)}</strong><div class="subtle">${escapeHtml(meeting.meeting_type || 'Committee meeting')}</div></td><td data-label="Date & time">${formatDate(meeting.date)}<div class="subtle">${escapeHtml(meeting.start_time || 'Time TBC')}${meeting.end_time ? `–${escapeHtml(meeting.end_time)}` : ''}</div></td><td data-label="Location / link">${escapeHtml(meeting.location || 'Not set')}${link ? `<div class="subtle">${link}</div>` : ''}</td><td data-label="Organiser">${escapeHtml(organiser?.name || 'Unassigned')}</td><td data-label="Status">${status}</td>${includeActions ? `<td data-label="Actions"><div class="row-actions"><button class="btn btn-secondary" data-edit-meeting="${escapeHtml(meeting.meeting_id)}">Edit</button><button class="btn btn-danger" data-delete-meeting="${escapeHtml(meeting.meeting_id)}">Delete</button></div></td>` : ''}</tr>`;
  }).join('')}</tbody></table></div>`;
}

function wireMeetingRows() {
  document.querySelectorAll('[data-meeting-status]').forEach(select => select.addEventListener('change', async () => {
    const meeting = (state.bootstrap.meetings || []).find(row => row.meeting_id === select.dataset.meetingStatus);
    if (!meeting) return;
    const previous = meeting.status; select.disabled = true;
    try { const saved = await api.saveMeeting({ ...meeting, status: select.value }); cacheMeeting(saved); toast('Meeting status saved.'); }
    catch (error) { select.value = previous; toast(error.message, 'error'); }
    finally { select.disabled = false; }
  }));
  document.querySelectorAll('[data-edit-meeting]').forEach(button => button.addEventListener('click', () => {
    const meeting = (state.bootstrap.meetings || []).find(row => row.meeting_id === button.dataset.editMeeting);
    if (meeting) openMeetingDialog(meeting);
  }));
  document.querySelectorAll('[data-delete-meeting]').forEach(button => button.addEventListener('click', async () => {
    const meeting = (state.bootstrap.meetings || []).find(row => row.meeting_id === button.dataset.deleteMeeting);
    if (!meeting || !window.confirm(`Delete the meeting “${meeting.meeting_name}”? This cannot be undone.`)) return;
    button.disabled = true;
    try { await api.deleteMeeting(meeting.meeting_id); removeCachedMeeting(meeting.meeting_id); toast('Meeting deleted.'); renderMeetings(); }
    catch (error) { button.disabled = false; toast(error.message, 'error'); }
  }));
}

function openMeetingDialog(record = {}) {
  const dialog = document.createElement('dialog');
  const members = state.bootstrap.committee || [];
  dialog.innerHTML = `<form method="dialog"><div class="dialog-header"><h2>${record.meeting_id ? 'Edit meeting' : 'Add meeting'}</h2><button class="icon-btn" value="cancel" aria-label="Close">✕</button></div><div class="dialog-body"><div class="form-grid cols-3"><label class="field-span">Meeting title<input name="meeting_name" required value="${escapeHtml(record.meeting_name)}" placeholder="Monthly committee meeting"></label><label>Meeting type<select name="meeting_type">${optionList(STATUSES.meetingType, record.meeting_type || 'Committee meeting')}</select></label><label>Status<select name="status">${optionList(STATUSES.meeting, record.status || 'Scheduled')}</select></label><label>Organiser<select name="organiser_member_id"><option value="">Unassigned</option>${members.map(member => `<option value="${member.member_id}" ${member.member_id === record.organiser_member_id ? 'selected' : ''}>${escapeHtml(member.name)}${String(member.active).toLowerCase() === 'false' ? ' (inactive)' : ''}</option>`).join('')}</select></label><label>Date<input name="date" type="date" value="${escapeHtml(record.date)}"></label><label>Start time<input name="start_time" type="time" value="${escapeHtml(record.start_time)}"></label><label>End time<input name="end_time" type="time" value="${escapeHtml(record.end_time)}"></label><label class="field-span">Location<input name="location" value="${escapeHtml(record.location)}" placeholder="Room name, building or Online"></label><label class="field-span">Online meeting link<input name="meeting_link" type="url" value="${escapeHtml(record.meeting_link)}" placeholder="https://…"></label><label class="field-span">Attendees<input name="attendees" value="${escapeHtml(record.attendees)}" placeholder="Names or groups expected to attend"></label><label class="field-span">Agenda<textarea name="agenda" placeholder="Topics to discuss">${escapeHtml(record.agenda)}</textarea></label><label class="field-span">Meeting notes<textarea name="notes" placeholder="Decisions, actions and follow-up notes">${escapeHtml(record.notes)}</textarea></label></div><div class="form-actions"><span class="save-state"></span><button class="btn btn-secondary" value="cancel">Cancel</button><button class="btn btn-primary" value="save">Save meeting</button></div></div></form>`;
  document.body.append(dialog); dialog.showModal(); dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('form').addEventListener('submit', async event => {
    if (event.submitter.value === 'cancel') return;
    event.preventDefault(); event.submitter.disabled = true; event.submitter.textContent = 'Saving…';
    try { const saved = await api.saveMeeting({ ...record, ...formObject(event.currentTarget) }); cacheMeeting(saved); dialog.close(); toast('Meeting saved.'); renderMeetings(); }
    catch (error) { event.submitter.disabled = false; event.submitter.textContent = 'Save meeting'; dialog.querySelector('.save-state').textContent = error.message; dialog.querySelector('.save-state').classList.add('error'); }
  });
}

function eventTaskFields(tasks, eventId) {
  const sorted = [...tasks].sort((a, b) => (a.status === 'Complete') - (b.status === 'Complete') || (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  return `<div id="event-task-list">${sorted.length ? `<div class="task-cards">${sorted.map(taskCard).join('')}</div>` : `<div class="empty-inline">No tasks have been assigned for this event.</div>`}</div><div class="form-actions"><a class="btn btn-secondary" href="#/tasks">View all tasks</a><button type="button" class="btn btn-primary" data-add-event-task="${escapeHtml(eventId)}">+ Add task</button></div>`;
}

function taskCard(task) {
  const member = (state.bootstrap.committee || []).find(row => row.member_id === task.assignee_member_id);
  const overdue = task.status !== 'Complete' && task.due_date && task.due_date < new Date().toISOString().slice(0, 10);
  return `<article class="task-card"><div><strong>${escapeHtml(task.task_name)}</strong><div class="subtle">${escapeHtml(member?.name || 'Unassigned')}${task.due_date ? ` · Due ${formatDate(task.due_date)}` : ''}</div></div><div>${badge(overdue ? 'Overdue' : task.status || 'Not started')}</div><button type="button" class="btn btn-secondary" data-edit-task="${escapeHtml(task.task_id)}">Edit</button></article>`;
}

function cacheTask(task) {
  state.bootstrap.tasks = (state.bootstrap.tasks || []).filter(row => row.task_id !== task.task_id).concat(task);
  if (state.event?.event) {
    state.event.tasks = (state.event.tasks || []).filter(row => row.task_id !== task.task_id);
    if (task.event_id === state.event.event.event_id) state.event.tasks.push(task);
  }
}

function removeCachedTask(taskId) {
  state.bootstrap.tasks = (state.bootstrap.tasks || []).filter(row => row.task_id !== taskId);
  if (state.event) state.event.tasks = (state.event.tasks || []).filter(row => row.task_id !== taskId);
}

function renderTasks() {
  const tasks = state.bootstrap.tasks || [];
  const activeMembers = (state.bootstrap.committee || []).filter(member => String(member.active).toLowerCase() !== 'false');
  const events = state.bootstrap.events || [];
  const open = tasks.filter(task => task.status !== 'Complete');
  const today = new Date().toISOString().slice(0, 10);
  app.innerHTML = `${configNotice()}<header class="page-header"><div><h1>Tasks</h1><p>See what needs doing, who owns it, and how work is progressing.</p></div><button class="btn btn-primary" id="add-task">+ Add task</button></header>
    <section class="summary-grid task-summary" aria-label="Task summary"><div class="metric"><strong>${open.length}</strong><span>Open tasks</span></div><div class="metric"><strong>${open.filter(task => task.due_date && task.due_date < today).length}</strong><span>Overdue</span></div><div class="metric"><strong>${tasks.filter(task => task.status === 'Blocked').length}</strong><span>Blocked</span></div><div class="metric"><strong>${tasks.filter(task => task.status === 'Complete').length}</strong><span>Complete</span></div></section>
    <div class="toolbar task-toolbar"><label>Search<input id="task-search" type="search" placeholder="Search tasks"></label><label>View tasks for<select id="task-member"><option value="">Everyone</option>${activeMembers.map(member => `<option value="${member.member_id}" ${member.member_id === state.taskMemberFilter ? 'selected' : ''}>${escapeHtml(member.name)}</option>`).join('')}</select></label><label>Status<select id="task-status-filter"><option value="">All statuses</option>${optionList(STATUSES.task)}</select></label><label>Event<select id="task-event-filter"><option value="">All events</option><option value="none">General tasks</option>${events.map(event => `<option value="${event.event_id}">${escapeHtml(event.event_name)}</option>`).join('')}</select></label></div>
    <section class="panel" id="task-list"></section>`;
  const update = () => {
    const search = document.querySelector('#task-search').value.toLowerCase();
    const member = document.querySelector('#task-member').value;
    const status = document.querySelector('#task-status-filter').value;
    const eventId = document.querySelector('#task-event-filter').value;
    state.taskMemberFilter = member;
    const filtered = tasks.filter(task => task.task_name.toLowerCase().includes(search) && (!member || task.assignee_member_id === member) && (!status || task.status === status) && (!eventId || (eventId === 'none' ? !task.event_id : task.event_id === eventId)));
    document.querySelector('#task-list').innerHTML = filtered.length ? taskTable(filtered) : `<div class="empty-state"><h2>No matching tasks</h2><p>Add a task or adjust the filters.</p></div>`;
    wireTaskRows();
  };
  document.querySelector('#add-task').addEventListener('click', () => openTaskDialog());
  ['#task-search', '#task-member', '#task-status-filter', '#task-event-filter'].forEach(selector => document.querySelector(selector).addEventListener('input', update));
  update();
}

function taskTable(tasks) {
  const members = state.bootstrap.committee || [];
  const events = state.bootstrap.events || [];
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...tasks].sort((a, b) => (a.status === 'Complete') - (b.status === 'Complete') || (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  return `<div class="table-wrap"><table class="responsive"><thead><tr><th>Task</th><th>Event</th><th>Assigned to</th><th>Due</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead><tbody>${sorted.map(task => {
    const member = members.find(row => row.member_id === task.assignee_member_id);
    const event = events.find(row => row.event_id === task.event_id);
    const overdue = task.status !== 'Complete' && task.due_date && task.due_date < today;
    return `<tr data-task-row="${escapeHtml(task.task_id)}"><td data-label="Task"><strong>${escapeHtml(task.task_name)}</strong><div class="subtle">${escapeHtml(task.description || '')}</div></td><td data-label="Event">${escapeHtml(event?.event_name || 'General')}</td><td data-label="Assigned to">${escapeHtml(member?.name || 'Unassigned')}</td><td data-label="Due">${task.due_date ? formatDate(task.due_date) : 'No due date'}${overdue ? '<div class="subtle danger-text">Overdue</div>' : ''}</td><td data-label="Priority">${escapeHtml(task.priority || 'Normal')}</td><td data-label="Status"><select class="task-status-select" data-task-status="${escapeHtml(task.task_id)}">${optionList(STATUSES.task, task.status || 'Not started')}</select></td><td data-label="Actions"><div class="row-actions"><button class="btn btn-secondary" data-edit-task="${escapeHtml(task.task_id)}">Edit</button><button class="btn btn-danger" data-delete-task="${escapeHtml(task.task_id)}">Delete</button></div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function wireTaskRows() {
  document.querySelectorAll('[data-task-status]').forEach(select => select.addEventListener('change', async () => {
    const task = (state.bootstrap.tasks || []).find(row => row.task_id === select.dataset.taskStatus);
    if (!task) return;
    const previous = task.status; select.disabled = true;
    try { const saved = await api.saveTask({ ...task, status: select.value }); cacheTask(saved); toast('Task status saved.'); }
    catch (error) { select.value = previous; toast(error.message, 'error'); }
    finally { select.disabled = false; }
  }));
  document.querySelectorAll('[data-edit-task]').forEach(button => button.addEventListener('click', () => {
    const task = (state.bootstrap.tasks || []).find(row => row.task_id === button.dataset.editTask);
    if (task) openTaskDialog(task);
  }));
  document.querySelectorAll('[data-delete-task]').forEach(button => button.addEventListener('click', async () => {
    const task = (state.bootstrap.tasks || []).find(row => row.task_id === button.dataset.deleteTask);
    if (!task || !window.confirm(`Delete the task “${task.task_name}”? This cannot be undone.`)) return;
    button.disabled = true;
    try { await api.deleteTask(task.task_id); removeCachedTask(task.task_id); toast('Task deleted.'); renderTasks(); }
    catch (error) { button.disabled = false; toast(error.message, 'error'); }
  }));
}

function openTaskDialog(record = {}, defaultEventId = '') {
  const dialog = document.createElement('dialog');
  const members = state.bootstrap.committee || [];
  const events = state.bootstrap.events || [];
  dialog.innerHTML = `<form method="dialog"><div class="dialog-header"><h2>${record.task_id ? 'Edit task' : 'Add task'}</h2><button class="icon-btn" value="cancel" aria-label="Close">✕</button></div><div class="dialog-body"><div class="form-grid"><label class="field-span">Task name<input name="task_name" required value="${escapeHtml(record.task_name)}"></label><label class="field-span">Description<textarea name="description">${escapeHtml(record.description)}</textarea></label><label>Assign to<select name="assignee_member_id"><option value="">Unassigned</option>${members.map(member => `<option value="${member.member_id}" ${member.member_id === record.assignee_member_id ? 'selected' : ''}>${escapeHtml(member.name)}${String(member.active).toLowerCase() === 'false' ? ' (inactive)' : ''}</option>`).join('')}</select></label><label>Event<select name="event_id"><option value="">General task</option>${events.map(event => `<option value="${event.event_id}" ${event.event_id === (record.event_id || defaultEventId) ? 'selected' : ''}>${escapeHtml(event.event_name)}</option>`).join('')}</select></label><label>Due date<input name="due_date" type="date" value="${escapeHtml(record.due_date)}"></label><label>Priority<select name="priority">${optionList(STATUSES.priority, record.priority || 'Normal')}</select></label><label>Status<select name="status">${optionList(STATUSES.task, record.status || 'Not started')}</select></label><label class="field-span">Notes<textarea name="notes">${escapeHtml(record.notes)}</textarea></label></div><div class="form-actions"><span class="save-state"></span><button class="btn btn-secondary" value="cancel">Cancel</button><button class="btn btn-primary" value="save">Save task</button></div></div></form>`;
  document.body.append(dialog); dialog.showModal(); dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('form').addEventListener('submit', async event => {
    if (event.submitter.value === 'cancel') return;
    event.preventDefault(); event.submitter.disabled = true; event.submitter.textContent = 'Saving…';
    try {
      const saved = await api.saveTask({ ...record, ...formObject(event.currentTarget) });
      cacheTask(saved); dialog.close(); toast('Task saved.');
      if (location.hash.startsWith('#/tasks')) renderTasks(); else refreshEventTaskPanel();
    } catch (error) { event.submitter.disabled = false; event.submitter.textContent = 'Save task'; dialog.querySelector('.save-state').textContent = error.message; dialog.querySelector('.save-state').classList.add('error'); }
  });
}

function wireEventTaskPanel() {
  document.querySelector('[data-add-event-task]')?.addEventListener('click', button => openTaskDialog({}, button.currentTarget.dataset.addEventTask));
  document.querySelectorAll('#event-tasks [data-edit-task]').forEach(button => button.addEventListener('click', () => {
    const task = (state.bootstrap.tasks || []).find(row => row.task_id === button.dataset.editTask);
    if (task) openTaskDialog(task);
  }));
}

function refreshEventTaskPanel() {
  const body = document.querySelector('#event-tasks .panel-body');
  if (!body || !state.event?.event) return;
  body.innerHTML = eventTaskFields(state.event.tasks || [], state.event.event.event_id);
  wireEventTaskPanel();
}

function collectRows(kind) {
  return [...document.querySelectorAll(`[data-kind="${kind}"]`)].map(row => {
    const record = {};
    row.querySelectorAll('[data-field]').forEach(field => { record[field.dataset.field] = field.value; });
    if (kind === 'speaker') { record.event_speaker_id = row.dataset.id; record.speaker_id = row.dataset.speakerId; }
    if (kind === 'poster') record.poster_id = row.dataset.id;
    if (kind === 'funding') record.funding_id = row.dataset.id;
    if (kind === 'organisation') record.event_organisation_id = row.dataset.id;
    if (kind === 'attendance') { record.attendance_id = row.dataset.id; record.member_id = row.dataset.memberId; }
    if (kind === 'checklist') { record.checklist_id = row.dataset.id; record.item_type = row.dataset.type; record.item_name = row.dataset.name; }
    if (kind === 'venue') record.venue_id = row.dataset.id;
    return record;
  });
}

function wireDetailForm() {
  const form = document.querySelector('#event-detail-form');
  form.addEventListener('input', () => { form.dataset.dirty = 'true'; document.querySelector('#save-state').textContent = 'Unsaved changes'; });
  form.addEventListener('click', event => {
    const add = event.target.closest('[data-add]');
    if (add) {
      const kind = add.dataset.add;
      const container = document.querySelector(`#${kind}-rows`);
      if (kind === 'speaker') container.insertAdjacentHTML('beforeend', speakerRow());
      if (kind === 'poster') container.insertAdjacentHTML('beforeend', posterRow());
      if (kind === 'funding') container.insertAdjacentHTML('beforeend', fundingRow());
      if (kind === 'organisation') { const wrapper = document.createElement('div'); wrapper.innerHTML = organisationFields([{}]); container.append(wrapper.querySelector('[data-kind="organisation"]')); }
      form.dispatchEvent(new Event('input'));
    }
    const remove = event.target.closest('[data-remove]');
    if (remove) { remove.closest('.repeat-row').remove(); form.dispatchEvent(new Event('input')); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.querySelector('#save-event'); const saveState = document.querySelector('#save-state');
    button.disabled = true; button.textContent = 'Saving…'; saveState.textContent = 'Saving to shared sheet…'; saveState.classList.remove('error');
    try {
      const payload = { event: { ...formObject(form), event_id: state.event.event.event_id }, funding: collectRows('funding'), speakers: collectRows('speaker'), posters: collectRows('poster'), venue: collectRows('venue')[0] || {}, organisations: collectRows('organisation'), attendance: collectRows('attendance'), checklist: collectRows('checklist') };
      state.event = await api.saveEventDetail(payload); cacheEventDetail(state.event); form.dataset.dirty = 'false'; saveState.textContent = 'Saved'; toast('All changes saved to the shared sheet.');
    } catch (error) { saveState.textContent = `Error saving — ${error.message}`; saveState.classList.add('error'); }
    finally { button.disabled = false; button.textContent = 'Save all changes'; }
  });
}

function renderCommittee() {
  const members = state.bootstrap.committee || [];
  app.innerHTML = `${configNotice()}<header class="page-header"><div><h1>Committee</h1><p>Manage active and historical organising committee members.</p></div><button class="btn btn-primary" id="add-member">+ Add member</button></header><section class="panel"><div class="table-wrap"><table class="responsive"><thead><tr><th>Name</th><th>Role</th><th>Organisation</th><th>Email</th><th>Status</th><th></th></tr></thead><tbody>${members.map(m => `<tr><td data-label="Name"><strong>${escapeHtml(m.name)}</strong></td><td data-label="Role">${escapeHtml(m.role)}</td><td data-label="Organisation">${escapeHtml(m.organisation_name || '—')}</td><td data-label="Email">${escapeHtml(m.email || '—')}</td><td data-label="Status">${badge(String(m.active).toLowerCase() !== 'false' ? 'Active' : 'Inactive')}</td><td><button class="btn btn-secondary" data-edit-member="${m.member_id}">Edit</button></td></tr>`).join('')}</tbody></table></div></section>`;
  document.querySelector('#add-member').addEventListener('click', () => openDirectoryDialog('member'));
  document.querySelectorAll('[data-edit-member]').forEach(b => b.addEventListener('click', () => openDirectoryDialog('member', members.find(m => m.member_id === b.dataset.editMember))));
}

function renderOrganisations() {
  const organisations = state.bootstrap.organisations || [];
  app.innerHTML = `${configNotice()}<header class="page-header"><div><h1>Organisations</h1><p>Keep partner and sponsor names consistent across events.</p></div><button class="btn btn-primary" id="add-organisation">+ Add organisation</button></header><section class="panel"><div class="table-wrap"><table class="responsive"><thead><tr><th>Organisation</th><th>Acronym</th><th>Contact</th><th>Email</th><th>Status</th><th></th></tr></thead><tbody>${organisations.map(o => `<tr><td data-label="Organisation"><strong>${escapeHtml(o.organisation_name)}</strong></td><td data-label="Acronym">${escapeHtml(o.acronym || '—')}</td><td data-label="Contact">${escapeHtml(o.contact_name || '—')}</td><td data-label="Email">${escapeHtml(o.contact_email || '—')}</td><td data-label="Status">${badge(String(o.active).toLowerCase() !== 'false' ? 'Active' : 'Archived')}</td><td><button class="btn btn-secondary" data-edit-org="${o.organisation_id}">Edit</button></td></tr>`).join('')}</tbody></table></div></section>`;
  document.querySelector('#add-organisation').addEventListener('click', () => openDirectoryDialog('organisation'));
  document.querySelectorAll('[data-edit-org]').forEach(b => b.addEventListener('click', () => openDirectoryDialog('organisation', organisations.find(o => o.organisation_id === b.dataset.editOrg))));
}

function openDirectoryDialog(kind, record = {}) {
  const isMember = kind === 'member';
  const dialog = document.createElement('dialog');
  const orgOptions = (state.bootstrap.organisations || []).map(o => `<option value="${o.organisation_id}" ${o.organisation_id === record.organisation_id ? 'selected' : ''}>${escapeHtml(o.organisation_name)}</option>`).join('');
  const activeValue = String(record.active ?? 'true').toLowerCase();
  const fields = isMember ? `<div class="form-grid"><label class="field-span">Name<input name="name" required value="${escapeHtml(record.name)}"></label><label>Position / role<input name="role" value="${escapeHtml(record.role)}"></label><label>Organisation<select name="organisation_id"><option value="">None</option>${orgOptions}</select></label><label>Email<input name="email" type="email" value="${escapeHtml(record.email)}"></label><label>Status<select name="active">${optionList(['true','false'], activeValue)}</select></label></div>` : `<div class="form-grid"><label class="field-span">Organisation name<input name="organisation_name" required value="${escapeHtml(record.organisation_name)}"></label><label>Acronym<input name="acronym" value="${escapeHtml(record.acronym)}"></label><label>Contact person<input name="contact_name" value="${escapeHtml(record.contact_name)}"></label><label>Contact email<input name="contact_email" type="email" value="${escapeHtml(record.contact_email)}"></label><label>Status<select name="active">${optionList(['true','false'], activeValue)}</select></label><label class="field-span">Notes<textarea name="notes">${escapeHtml(record.notes)}</textarea></label></div>`;
  dialog.innerHTML = `<form method="dialog"><div class="dialog-header"><h2>${record[isMember ? 'member_id' : 'organisation_id'] ? 'Edit' : 'Add'} ${isMember ? 'committee member' : 'organisation'}</h2><button class="icon-btn" value="cancel">✕</button></div><div class="dialog-body">${fields}<div class="form-actions"><span class="save-state"></span><button class="btn btn-secondary" value="cancel">Cancel</button><button class="btn btn-primary" value="save">Save</button></div></div></form>`;
  document.body.append(dialog); dialog.showModal(); dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('form').addEventListener('submit', async event => {
    if (event.submitter.value === 'cancel') return;
    event.preventDefault(); event.submitter.disabled = true;
    try {
      const data = { ...record, ...formObject(event.currentTarget) };
      const saved = isMember ? await api.saveCommittee(data) : await api.saveOrganisation(data);
      if (isMember) {
        state.bootstrap.committee = (state.bootstrap.committee || []).filter(row => row.member_id !== saved.member_id).concat(saved);
        state.bootstrap.events = (state.bootstrap.events || []).map(row => row.lead_organiser_id === saved.member_id ? { ...row, lead_organiser_name: saved.name } : row);
      } else {
        state.bootstrap.organisations = (state.bootstrap.organisations || []).filter(row => row.organisation_id !== saved.organisation_id).concat(saved);
      }
      dialog.close(); toast('Saved to the shared sheet.'); isMember ? renderCommittee() : renderOrganisations();
    } catch (error) { event.submitter.disabled = false; dialog.querySelector('.save-state').textContent = error.message; dialog.querySelector('.save-state').classList.add('error'); }
  });
}

if (!location.hash) location.hash = '#/dashboard'; else route();
