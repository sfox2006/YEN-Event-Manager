/**
 * YEN Event Manager — Google Apps Script JSON API
 * Bind this script to the Google Sheet, run setupSpreadsheet(), then deploy as a web app.
 */

const SCHEMA = {
  Events: ['event_id', 'event_name', 'description', 'event_type', 'date', 'start_time', 'end_time', 'status', 'lead_organiser_id', 'funding_required', 'room_required', 'registration_link', 'registration_numbers', 'registration_capacity', 'notes', 'created_at', 'updated_at'],
  Speakers: ['speaker_id', 'name', 'organisation_name', 'title', 'email', 'notes', 'created_at', 'updated_at'],
  Event_Speakers: ['event_speaker_id', 'event_id', 'speaker_id', 'invitation_status', 'notes', 'created_at', 'updated_at'],
  Event_Posters: ['poster_id', 'event_id', 'title', 'drive_url', 'status', 'notes', 'created_at', 'updated_at'],
  Event_Tasks: ['task_id', 'event_id', 'task_name', 'description', 'assignee_member_id', 'due_date', 'priority', 'status', 'notes', 'created_at', 'updated_at'],
  Meetings: ['meeting_id', 'meeting_name', 'meeting_type', 'date', 'start_time', 'end_time', 'location', 'meeting_link', 'organiser_member_id', 'organisation_id', 'external_organisation', 'status', 'attendees', 'agenda', 'notes', 'created_at', 'updated_at'],
  Committee: ['member_id', 'name', 'role', 'organisation_id', 'email', 'active', 'created_at', 'updated_at'],
  Event_Attendance: ['attendance_id', 'event_id', 'member_id', 'attendance_status', 'event_role', 'notes', 'created_at', 'updated_at'],
  Organisations: ['organisation_id', 'organisation_name', 'acronym', 'contact_name', 'contact_email', 'notes', 'active', 'created_at', 'updated_at'],
  Event_Organisations: ['event_organisation_id', 'event_id', 'organisation_id', 'relationship_type', 'created_at', 'updated_at'],
  Funding: ['funding_id', 'event_id', 'organisation_id', 'source_name', 'status', 'amount_requested', 'amount_confirmed', 'notes', 'created_at', 'updated_at'],
  Venues: ['venue_id', 'event_id', 'venue', 'room', 'booking_status', 'capacity', 'address', 'notes', 'created_at', 'updated_at'],
  Event_Checklist: ['checklist_id', 'event_id', 'item_type', 'item_name', 'status', 'notes', 'created_at', 'updated_at']
};

const ID_FIELDS = {
  Events: 'event_id', Speakers: 'speaker_id', Event_Speakers: 'event_speaker_id',
  Event_Posters: 'poster_id', Event_Tasks: 'task_id', Meetings: 'meeting_id', Committee: 'member_id', Event_Attendance: 'attendance_id', Organisations: 'organisation_id',
  Event_Organisations: 'event_organisation_id', Funding: 'funding_id', Venues: 'venue_id',
  Event_Checklist: 'checklist_id'
};

function setupSpreadsheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Open Apps Script from the target Google Sheet before running setupSpreadsheet.');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheet.getId());
  Object.keys(SCHEMA).forEach(function (name) {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    const headers = SCHEMA[name];
    if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    else {
      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();
      const existing = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
      const oldHeaders = existing[0];
      const requiresMigration = headers.some(function (header, index) { return oldHeaders[index] !== header; });
      if (requiresMigration) {
        const migrated = existing.slice(1).map(function (row) {
          return headers.map(function (header) {
            const oldIndex = oldHeaders.indexOf(header);
            return oldIndex === -1 ? '' : row[oldIndex];
          });
        });
        sheet.getRange(1, 1, lastRow, Math.max(lastColumn, headers.length)).clearContent();
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        if (migrated.length) sheet.getRange(2, 1, migrated.length, headers.length).setValues(migrated);
      }
    }
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#12304a').setFontColor('#ffffff');
    sheet.autoResizeColumns(1, headers.length);
  });
  return 'Created/verified ' + Object.keys(SCHEMA).length + ' data tabs.';
}

function doGet(e) {
  return handleRequest_(e && e.parameter ? e.parameter : {}, null);
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); }
  catch (error) { return json_({ ok: false, error: 'The request body was not valid JSON.' }); }
  return handleRequest_(e && e.parameter ? e.parameter : {}, body);
}

function handleRequest_(params, body) {
  try {
    requireSetup_();
    const action = params.action || 'health';
    if (action === 'health') return json_({ ok: true, data: { service: 'YEN Event Manager API', status: 'ready' } });
    if (action === 'bootstrap') return json_({ ok: true, data: getBootstrap_() });
    if (action === 'event') return json_({ ok: true, data: getEventDetail_(params.event_id) });
    if (action === 'saveEvent') return withLock_(function () { return json_({ ok: true, data: saveEvent_(body.event || {}) }); });
    if (action === 'saveEventDetail') return withLock_(function () { return json_({ ok: true, data: saveEventDetail_(body || {}) }); });
    if (action === 'saveCommittee') return withLock_(function () { return json_({ ok: true, data: saveCommittee_(body.member || {}) }); });
    if (action === 'saveOrganisation') return withLock_(function () { return json_({ ok: true, data: saveOrganisation_(body.organisation || {}) }); });
    if (action === 'saveMeeting') return withLock_(function () { return json_({ ok: true, data: saveMeeting_(body.meeting || {}) }); });
    if (action === 'deleteMeeting') return withLock_(function () { return json_({ ok: true, data: deleteMeeting_(body.meeting_id) }); });
    if (action === 'saveTask') return withLock_(function () { return json_({ ok: true, data: saveTask_(body.task || {}) }); });
    if (action === 'deleteTask') return withLock_(function () { return json_({ ok: true, data: deleteTask_(body.task_id) }); });
    return json_({ ok: false, error: 'Unknown API action: ' + action });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return json_({ ok: false, error: error.message || String(error) });
  }
}

function getBootstrap_() {
  const tables = readTables_(Object.keys(SCHEMA));
  const events = tables.Events.map(function (event) {
    const detail = buildEventDetail_(event, tables);
    const lead = tables.Committee.find(function (member) { return member.member_id === event.lead_organiser_id; });
    const confirmed = detail.attendance.filter(function (row) { return row.attendance_status === 'Confirmed attending'; }).length;
    const fundingStatus = detail.funding.length ? bestStatus_(detail.funding.map(function (row) { return row.status; }), ['Confirmed', 'Pending', 'No', 'N/A']) : (event.funding_required === 'No' ? 'N/A' : 'Not started');
    const activeSpeakers = detail.speakers.filter(function (row) { return ['Declined', 'Withdrawn'].indexOf(row.invitation_status) === -1; });
    const confirmedSpeakers = activeSpeakers.filter(function (row) { return row.invitation_status === 'Confirmed'; }).length;
    return Object.assign({}, event, {
      progress: progressFor_(detail),
      funding_status: fundingStatus,
      speaker_summary: confirmedSpeakers + '/' + activeSpeakers.length,
      room_status: detail.venue.booking_status || (event.room_required === 'No' ? 'Not required' : 'Not started'),
      committee_confirmed: confirmed,
      lead_organiser_name: lead ? lead.name : '',
      organisation_ids: detail.organisations.map(function (row) { return row.organisation_id; })
    });
  });
  return { events: events, committee: tables.Committee, organisations: tables.Organisations, meetings: tables.Meetings, tasks: tables.Event_Tasks };
}

function getEventDetail_(eventId) {
  if (!eventId) throw new Error('event_id is required.');
  const tables = readTables_(Object.keys(SCHEMA));
  const event = tables.Events.find(function (row) { return row.event_id === eventId; });
  if (!event) throw new Error('Event not found.');
  return buildEventDetail_(event, tables);
}

function buildEventDetail_(event, tables) {
  const eventId = event.event_id;
  const links = tables.Event_Speakers.filter(function (row) { return row.event_id === eventId; });
  const speakerDetails = links.map(function (link) {
    const speaker = tables.Speakers.find(function (row) { return row.speaker_id === link.speaker_id; }) || {};
    return Object.assign({}, speaker, link);
  });
  const orgLinks = tables.Event_Organisations.filter(function (row) { return row.event_id === eventId; });
  const eventOrganisations = orgLinks.map(function (link) {
    const organisation = tables.Organisations.find(function (row) { return row.organisation_id === link.organisation_id; }) || {};
    return Object.assign({}, organisation, link);
  });
  return {
    event: event,
    speakers: speakerDetails,
    posters: tables.Event_Posters.filter(function (row) { return row.event_id === eventId; }),
    tasks: tables.Event_Tasks.filter(function (row) { return row.event_id === eventId; }),
    funding: tables.Funding.filter(function (row) { return row.event_id === eventId; }),
    venue: tables.Venues.find(function (row) { return row.event_id === eventId; }) || {},
    organisations: eventOrganisations,
    attendance: tables.Event_Attendance.filter(function (row) { return row.event_id === eventId; }),
    checklist: tables.Event_Checklist.filter(function (row) { return row.event_id === eventId; })
  };
}

function saveEvent_(event) {
  if (!String(event.event_name || '').trim()) throw new Error('Event name is required.');
  const spreadsheet = getSpreadsheet_();
  const events = readTableFromSheet_(getSheet_('Events', spreadsheet), 'Events');
  const now = new Date().toISOString();
  event.event_id = event.event_id || makeId_('event');
  const saved = upsertInMemory_('Events', events, event, now);
  writeTable_('Events', events, spreadsheet);
  return saved;
}

function saveEventDetail_(payload) {
  const spreadsheet = getSpreadsheet_();
  const tables = readTables_(Object.keys(SCHEMA), spreadsheet);
  const now = new Date().toISOString();
  const eventInput = payload.event || {};
  if (!String(eventInput.event_name || '').trim()) throw new Error('Event name is required.');
  eventInput.event_id = eventInput.event_id || makeId_('event');
  const event = upsertInMemory_('Events', tables.Events, eventInput, now);
  const eventId = event.event_id;
  writeTable_('Events', tables.Events, spreadsheet);

  tables.Funding = replaceEventRowsInMemory_('Funding', tables.Funding, eventId, payload.funding || [], 'funding', now);
  writeTable_('Funding', tables.Funding, spreadsheet);

  const speakerLinks = (payload.speakers || []).filter(function (row) { return String(row.name || '').trim(); }).map(function (row) {
    const speaker = {
      speaker_id: row.speaker_id || makeId_('speaker'), name: row.name, organisation_name: row.organisation_name,
      title: row.title, email: row.email, notes: row.notes
    };
    upsertInMemory_('Speakers', tables.Speakers, speaker, now);
    return { event_speaker_id: row.event_speaker_id || makeId_('event_speaker'), event_id: eventId, speaker_id: speaker.speaker_id, invitation_status: row.invitation_status, notes: row.notes };
  });
  writeTable_('Speakers', tables.Speakers, spreadsheet);
  tables.Event_Speakers = replaceEventRowsInMemory_('Event_Speakers', tables.Event_Speakers, eventId, speakerLinks, 'event_speaker', now);
  writeTable_('Event_Speakers', tables.Event_Speakers, spreadsheet);

  tables.Event_Posters = replaceEventRowsInMemory_('Event_Posters', tables.Event_Posters, eventId, (payload.posters || []).filter(function (row) {
    return String(row.drive_url || '').trim() || String(row.title || '').trim();
  }), 'poster', now);
  writeTable_('Event_Posters', tables.Event_Posters, spreadsheet);

  const venue = payload.venue || {};
  tables.Venues = replaceEventRowsInMemory_('Venues', tables.Venues, eventId, Object.keys(venue).length ? [venue] : [], 'venue', now);
  writeTable_('Venues', tables.Venues, spreadsheet);

  tables.Event_Organisations = replaceEventRowsInMemory_('Event_Organisations', tables.Event_Organisations, eventId, (payload.organisations || []).filter(function (row) { return row.organisation_id; }), 'event_organisation', now);
  writeTable_('Event_Organisations', tables.Event_Organisations, spreadsheet);
  tables.Event_Attendance = replaceEventRowsInMemory_('Event_Attendance', tables.Event_Attendance, eventId, payload.attendance || [], 'attendance', now);
  writeTable_('Event_Attendance', tables.Event_Attendance, spreadsheet);
  tables.Event_Checklist = replaceEventRowsInMemory_('Event_Checklist', tables.Event_Checklist, eventId, payload.checklist || [], 'checklist', now);
  writeTable_('Event_Checklist', tables.Event_Checklist, spreadsheet);
  return buildEventDetail_(event, tables);
}

function saveCommittee_(member) {
  if (!String(member.name || '').trim()) throw new Error('Committee member name is required.');
  const spreadsheet = getSpreadsheet_();
  const rows = readTableFromSheet_(getSheet_('Committee', spreadsheet), 'Committee');
  member.member_id = member.member_id || makeId_('member');
  if (member.active === undefined || member.active === '') member.active = 'true';
  const saved = upsertInMemory_('Committee', rows, member, new Date().toISOString());
  writeTable_('Committee', rows, spreadsheet);
  return saved;
}

function saveOrganisation_(organisation) {
  if (!String(organisation.organisation_name || '').trim()) throw new Error('Organisation name is required.');
  const spreadsheet = getSpreadsheet_();
  const rows = readTableFromSheet_(getSheet_('Organisations', spreadsheet), 'Organisations');
  organisation.organisation_id = organisation.organisation_id || makeId_('organisation');
  if (organisation.active === undefined || organisation.active === '') organisation.active = 'true';
  const saved = upsertInMemory_('Organisations', rows, organisation, new Date().toISOString());
  writeTable_('Organisations', rows, spreadsheet);
  return saved;
}

function saveTask_(task) {
  if (!String(task.task_name || '').trim()) throw new Error('Task name is required.');
  const spreadsheet = getSpreadsheet_();
  const rows = readTableFromSheet_(getSheet_('Event_Tasks', spreadsheet), 'Event_Tasks');
  task.task_id = task.task_id || makeId_('task');
  task.status = task.status || 'Not started';
  task.priority = task.priority || 'Normal';
  const saved = upsertInMemory_('Event_Tasks', rows, task, new Date().toISOString());
  writeTable_('Event_Tasks', rows, spreadsheet);
  return saved;
}

function saveMeeting_(meeting) {
  if (!String(meeting.meeting_name || '').trim()) throw new Error('Meeting title is required.');
  const spreadsheet = getSpreadsheet_();
  const rows = readTableFromSheet_(getSheet_('Meetings', spreadsheet), 'Meetings');
  meeting.meeting_id = meeting.meeting_id || makeId_('meeting');
  meeting.status = meeting.status || 'Planned';
  meeting.meeting_type = meeting.meeting_type || 'Executive meeting';
  const saved = upsertInMemory_('Meetings', rows, meeting, new Date().toISOString());
  writeTable_('Meetings', rows, spreadsheet);
  return saved;
}

function deleteMeeting_(meetingId) {
  if (!meetingId) throw new Error('meeting_id is required.');
  const spreadsheet = getSpreadsheet_();
  const rows = readTableFromSheet_(getSheet_('Meetings', spreadsheet), 'Meetings');
  const remaining = rows.filter(function (row) { return row.meeting_id !== meetingId; });
  if (remaining.length === rows.length) throw new Error('Meeting not found.');
  writeTable_('Meetings', remaining, spreadsheet);
  return { meeting_id: meetingId };
}

function deleteTask_(taskId) {
  if (!taskId) throw new Error('task_id is required.');
  const spreadsheet = getSpreadsheet_();
  const rows = readTableFromSheet_(getSheet_('Event_Tasks', spreadsheet), 'Event_Tasks');
  const remaining = rows.filter(function (row) { return row.task_id !== taskId; });
  if (remaining.length === rows.length) throw new Error('Task not found.');
  writeTable_('Event_Tasks', remaining, spreadsheet);
  return { task_id: taskId };
}

function progressFor_(detail) {
  const checks = [];
  function add(applicable, done) { if (applicable) checks.push(Boolean(done)); }
  add(true, Boolean(detail.event.date));
  add(true, Boolean(detail.event.lead_organiser_id));
  add(detail.event.funding_required !== 'No', detail.event.funding_required === 'No' || detail.funding.some(function (row) { return ['Confirmed', 'N/A'].indexOf(row.status) !== -1; }));
  add(detail.event.room_required !== 'No', detail.event.room_required === 'No' || ['Confirmed', 'Not required'].indexOf(detail.venue.booking_status) !== -1);
  const speakers = detail.speakers.filter(function (row) { return ['Declined', 'Withdrawn'].indexOf(row.invitation_status) === -1; });
  add(speakers.length > 0, speakers.length > 0 && speakers.every(function (row) { return row.invitation_status === 'Confirmed'; }));
  detail.checklist.forEach(function (row) { add(row.status !== 'Not applicable', row.status === 'Complete'); });
  return checks.length ? Math.round(checks.filter(Boolean).length / checks.length * 100) : 0;
}

function upsertInMemory_(table, rows, record, now) {
  const idField = ID_FIELDS[table];
  const id = String(record[idField] || '');
  if (!id) throw new Error(idField + ' is required.');
  const index = rows.findIndex(function (row) { return row[idField] === id; });
  const existing = index >= 0 ? rows[index] : {};
  const saved = Object.assign({}, existing, record, {
    created_at: existing.created_at || record.created_at || now,
    updated_at: now
  });
  if (index >= 0) rows[index] = saved; else rows.push(saved);
  return saved;
}

function replaceEventRowsInMemory_(table, rows, eventId, incoming, idPrefix, now) {
  const idField = ID_FIELDS[table];
  const existingById = {};
  rows.forEach(function (row) { existingById[row[idField]] = row; });
  const replacements = incoming.map(function (input) {
    const record = Object.assign({}, input, { event_id: eventId });
    record[idField] = record[idField] || makeId_(idPrefix);
    const existing = existingById[record[idField]] || {};
    return Object.assign({}, existing, record, {
      created_at: existing.created_at || record.created_at || now,
      updated_at: now
    });
  });
  return rows.filter(function (row) { return row.event_id !== eventId; }).concat(replacements);
}

function readTables_(names, spreadsheet) {
  const book = spreadsheet || getSpreadsheet_();
  const tables = {};
  names.forEach(function (name) {
    tables[name] = readTableFromSheet_(getSheet_(name, book), name);
  });
  return tables;
}

function readTableFromSheet_(sheet, name) {
  const headers = SCHEMA[name];
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues().map(function (row) {
    const record = {}; headers.forEach(function (header, index) { record[header] = row[index]; }); return record;
  });
}

function writeTable_(name, rows, spreadsheet) {
  const sheet = getSheet_(name, spreadsheet);
  const headers = SCHEMA[name];
  const existingRows = Math.max(sheet.getLastRow() - 1, 0);
  if (existingRows) sheet.getRange(2, 1, existingRows, headers.length).clearContent();
  if (rows.length) {
    const values = rows.map(function (record) {
      return headers.map(function (header) { return record[header] === undefined ? '' : record[header]; });
    });
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  }
}

function getSheet_(name, spreadsheet) {
  const sheet = (spreadsheet || getSpreadsheet_()).getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet tab: ' + name + '. Run setupSpreadsheet().');
  return sheet;
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Spreadsheet is not initialised. Run setupSpreadsheet() once from Apps Script.');
  return SpreadsheetApp.openById(id);
}

function requireSetup_() { getSpreadsheet_(); }
function makeId_(prefix) { return prefix + '_' + Utilities.getUuid(); }
function bestStatus_(statuses, order) { return order.find(function (value) { return statuses.indexOf(value) !== -1; }) || statuses[0] || ''; }
function withLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Another update is in progress. Please retry.');
  try { return callback(); } finally { lock.releaseLock(); }
}
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
