/**
 * YEN Event Manager — Google Apps Script JSON API
 * Bind this script to the Google Sheet, run setupSpreadsheet(), then deploy as a web app.
 */

const SCHEMA = {
  Events: ['event_id', 'event_name', 'description', 'event_type', 'date', 'start_time', 'end_time', 'status', 'lead_organiser_id', 'funding_required', 'room_required', 'registration_link', 'registration_numbers', 'registration_capacity', 'notes', 'created_at', 'updated_at'],
  Speakers: ['speaker_id', 'name', 'organisation_name', 'title', 'email', 'notes', 'created_at', 'updated_at'],
  Event_Speakers: ['event_speaker_id', 'event_id', 'speaker_id', 'invitation_status', 'notes', 'created_at', 'updated_at'],
  Event_Posters: ['poster_id', 'event_id', 'title', 'drive_url', 'status', 'notes', 'created_at', 'updated_at'],
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
  Event_Posters: 'poster_id', Committee: 'member_id', Event_Attendance: 'attendance_id', Organisations: 'organisation_id',
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
    return json_({ ok: false, error: 'Unknown API action: ' + action });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return json_({ ok: false, error: error.message || String(error) });
  }
}

function getBootstrap_() {
  const committee = readTable_('Committee');
  const organisations = readTable_('Organisations');
  const events = readTable_('Events').map(function (event) {
    const detail = getEventDetailFromTables_(event, committee, organisations);
    const lead = committee.find(function (member) { return member.member_id === event.lead_organiser_id; });
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
  return { events: events, committee: committee, organisations: organisations };
}

function getEventDetail_(eventId) {
  if (!eventId) throw new Error('event_id is required.');
  const event = readTable_('Events').find(function (row) { return row.event_id === eventId; });
  if (!event) throw new Error('Event not found.');
  return getEventDetailFromTables_(event, readTable_('Committee'), readTable_('Organisations'));
}

function getEventDetailFromTables_(event, committee, organisations) {
  const eventId = event.event_id;
  const speakers = readTable_('Speakers');
  const links = readTable_('Event_Speakers').filter(function (row) { return row.event_id === eventId; });
  const speakerDetails = links.map(function (link) {
    const speaker = speakers.find(function (row) { return row.speaker_id === link.speaker_id; }) || {};
    return Object.assign({}, speaker, link);
  });
  const orgLinks = readTable_('Event_Organisations').filter(function (row) { return row.event_id === eventId; });
  const eventOrganisations = orgLinks.map(function (link) {
    const organisation = organisations.find(function (row) { return row.organisation_id === link.organisation_id; }) || {};
    return Object.assign({}, organisation, link);
  });
  return {
    event: event,
    speakers: speakerDetails,
    posters: readTable_('Event_Posters').filter(function (row) { return row.event_id === eventId; }),
    funding: readTable_('Funding').filter(function (row) { return row.event_id === eventId; }),
    venue: readTable_('Venues').find(function (row) { return row.event_id === eventId; }) || {},
    organisations: eventOrganisations,
    attendance: readTable_('Event_Attendance').filter(function (row) { return row.event_id === eventId; }),
    checklist: readTable_('Event_Checklist').filter(function (row) { return row.event_id === eventId; })
  };
}

function saveEvent_(event) {
  if (!String(event.event_name || '').trim()) throw new Error('Event name is required.');
  const now = new Date().toISOString();
  event.event_id = event.event_id || makeId_('event');
  event.created_at = event.created_at || now;
  event.updated_at = now;
  upsert_('Events', event);
  return readTable_('Events').find(function (row) { return row.event_id === event.event_id; });
}

function saveEventDetail_(payload) {
  const event = saveEvent_(payload.event || {});
  const eventId = event.event_id;

  syncEventRows_('Funding', eventId, payload.funding || [], function (row) {
    row.funding_id = row.funding_id || makeId_('funding'); return row;
  });

  const speakerLinks = (payload.speakers || []).filter(function (row) { return String(row.name || '').trim(); }).map(function (row) {
    const speaker = {
      speaker_id: row.speaker_id || makeId_('speaker'), name: row.name, organisation_name: row.organisation_name,
      title: row.title, email: row.email, notes: row.notes
    };
    upsertWithTimestamps_('Speakers', speaker);
    return { event_speaker_id: row.event_speaker_id || makeId_('event_speaker'), event_id: eventId, speaker_id: speaker.speaker_id, invitation_status: row.invitation_status, notes: row.notes };
  });
  syncEventRows_('Event_Speakers', eventId, speakerLinks);

  syncEventRows_('Event_Posters', eventId, (payload.posters || []).filter(function (row) {
    return String(row.drive_url || '').trim() || String(row.title || '').trim();
  }).map(function (row) {
    row.poster_id = row.poster_id || makeId_('poster'); return row;
  }));

  const venue = payload.venue || {};
  if (Object.keys(venue).length) {
    venue.venue_id = venue.venue_id || makeId_('venue'); venue.event_id = eventId;
    upsertWithTimestamps_('Venues', venue);
    removeEventRowsExcept_('Venues', eventId, [venue.venue_id]);
  } else removeEventRowsExcept_('Venues', eventId, []);

  syncEventRows_('Event_Organisations', eventId, (payload.organisations || []).filter(function (row) { return row.organisation_id; }).map(function (row) {
    row.event_organisation_id = row.event_organisation_id || makeId_('event_organisation'); return row;
  }));
  syncEventRows_('Event_Attendance', eventId, (payload.attendance || []).map(function (row) {
    row.attendance_id = row.attendance_id || makeId_('attendance'); return row;
  }));
  syncEventRows_('Event_Checklist', eventId, (payload.checklist || []).map(function (row) {
    row.checklist_id = row.checklist_id || makeId_('checklist'); return row;
  }));
  return getEventDetail_(eventId);
}

function saveCommittee_(member) {
  if (!String(member.name || '').trim()) throw new Error('Committee member name is required.');
  member.member_id = member.member_id || makeId_('member');
  if (member.active === undefined || member.active === '') member.active = 'true';
  upsertWithTimestamps_('Committee', member);
  return readTable_('Committee').find(function (row) { return row.member_id === member.member_id; });
}

function saveOrganisation_(organisation) {
  if (!String(organisation.organisation_name || '').trim()) throw new Error('Organisation name is required.');
  organisation.organisation_id = organisation.organisation_id || makeId_('organisation');
  if (organisation.active === undefined || organisation.active === '') organisation.active = 'true';
  upsertWithTimestamps_('Organisations', organisation);
  return readTable_('Organisations').find(function (row) { return row.organisation_id === organisation.organisation_id; });
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

function syncEventRows_(table, eventId, rows, transform) {
  const idField = ID_FIELDS[table];
  const ids = [];
  rows.forEach(function (input) {
    const row = Object.assign({}, input, { event_id: eventId });
    if (transform) transform(row);
    if (!row[idField]) row[idField] = makeId_(table.toLowerCase());
    upsertWithTimestamps_(table, row); ids.push(row[idField]);
  });
  removeEventRowsExcept_(table, eventId, ids);
}

function removeEventRowsExcept_(table, eventId, keepIds) {
  const sheet = getSheet_(table);
  const rows = readTable_(table);
  const idField = ID_FIELDS[table];
  const deleteNumbers = [];
  rows.forEach(function (row, index) {
    if (row.event_id === eventId && keepIds.indexOf(row[idField]) === -1) deleteNumbers.push(index + 2);
  });
  deleteNumbers.sort(function (a, b) { return b - a; }).forEach(function (rowNumber) { sheet.deleteRow(rowNumber); });
}

function upsertWithTimestamps_(table, record) {
  const now = new Date().toISOString();
  const existing = readTable_(table).find(function (row) { return row[ID_FIELDS[table]] === record[ID_FIELDS[table]]; });
  record.created_at = (existing && existing.created_at) || record.created_at || now;
  record.updated_at = now;
  upsert_(table, record);
}

function upsert_(table, record) {
  const headers = SCHEMA[table];
  const idField = ID_FIELDS[table];
  const id = String(record[idField] || '');
  if (!id) throw new Error(idField + ' is required.');
  const sheet = getSheet_(table);
  const values = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues() : [];
  const idIndex = headers.indexOf(idField);
  const rowIndex = values.findIndex(function (row) { return row[idIndex] === id; });
  const existing = rowIndex >= 0 ? values[rowIndex] : headers.map(function () { return ''; });
  const output = headers.map(function (header, index) { return record[header] === undefined ? existing[index] : record[header]; });
  if (rowIndex >= 0) sheet.getRange(rowIndex + 2, 1, 1, headers.length).setValues([output]);
  else sheet.appendRow(output);
}

function readTable_(name) {
  const sheet = getSheet_(name);
  const headers = SCHEMA[name];
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues().map(function (row) {
    const record = {}; headers.forEach(function (header, index) { record[header] = row[index]; }); return record;
  });
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
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
