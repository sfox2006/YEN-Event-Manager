import { api, isConfigured } from './api.js';
import { STATUSES, CHECKLIST_ITEMS, escapeHtml, formatDate, eventBucket, progressFor, speakerSummary, attendanceSummary, statusTone, formObject, optionList } from './utils.js';

const app = document.querySelector('#app');
const nav = document.querySelector('#main-nav');
const navToggle = document.querySelector('.nav-toggle');
const state = { bootstrap: null, event: null, filter: 'upcoming' };

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
    state.bootstrap ||= { events: [], committee: [], organisations: [] };
  } else {
    try { await ensureBootstrap(); } catch (error) { errorView(error); return; }
  }
  try {
    if (routeName === 'events') renderEvents();
    else if (routeName === 'event' && id) await renderEventDetail(id);
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
  app.innerHTML = `${configNotice()}
    <header class="page-header"><div><h1>Dashboard</h1><p>Where are we at with each event?</p></div><div class="header-actions"><button class="btn btn-primary" id="add-event">+ Add Event</button></div></header>
    <section class="summary-grid" aria-label="Event summary">
      <div class="metric"><strong>${events.length}</strong><span>Upcoming events</span></div>
      <div class="metric"><strong>${confirmed}</strong><span>Confirmed or open</span></div>
      <div class="metric"><strong>${actionNeeded}</strong><span>Below 50% readiness</span></div>
      <div class="metric"><strong>${events.reduce((sum, e) => sum + Number(e.committee_confirmed || 0), 0)}</strong><span>Confirmed attendances</span></div>
    </section>
    <section class="panel"><div class="panel-header"><h2>Upcoming events</h2><a href="#/events">View all events</a></div>
      ${events.length ? eventTable(events) : `<div class="empty-state"><h2>No upcoming events yet</h2><p>Create an event to start tracking preparations.</p><button class="btn btn-primary" id="empty-add-event">+ Add Event</button></div>`}
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
      await ensureBootstrap(true); dialog.close(); toast('Event created and saved.'); location.hash = `#/event/${saved.event_id}`;
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
      ${panel('checklist', 'Event checklist', checklistFields(d.checklist || []))}
      <div class="panel"><div class="panel-body"><div class="form-actions"><span class="save-state" id="save-state">No unsaved changes.</span><button class="btn btn-primary" type="submit" id="save-event">Save all changes</button></div></div></div>
    </form><aside class="detail-nav" aria-label="Event sections">${['basic','funding','speakers','posters','venue','organisations','attendance','checklist'].map(s => `<a href="#${s}">${s[0].toUpperCase()+s.slice(1)}</a>`).join('')}</aside></div>`;
  wireDetailForm();
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
      state.event = await api.saveEventDetail(payload); form.dataset.dirty = 'false'; saveState.textContent = 'Saved'; toast('All changes saved to the shared sheet.'); await ensureBootstrap(true);
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
      if (isMember) await api.saveCommittee(data); else await api.saveOrganisation(data);
      await ensureBootstrap(true); dialog.close(); toast('Saved to the shared sheet.'); isMember ? renderCommittee() : renderOrganisations();
    } catch (error) { event.submitter.disabled = false; dialog.querySelector('.save-state').textContent = error.message; dialog.querySelector('.save-state').classList.add('error'); }
  });
}

if (!location.hash) location.hash = '#/dashboard'; else route();
