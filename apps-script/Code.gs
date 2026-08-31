/**
 * YEN Event Manager — Google Apps Script JSON API
 * Bind this script to the Google Sheet, run setupSpreadsheet(), then deploy as a web app.
 */

const SCHEMA = {
  Events: ['event_id', 'event_name', 'description', 'event_type', 'date', 'start_time', 'end_time', 'status', 'lead_organiser_id', 'funding_required', 'room_required', 'registration_link', 'registration_numbers', 'registration_capacity', 'notes', 'created_at', 'updated_at'],
  Speakers: ['speaker_id', 'name', 'organisation_name', 'title', 'email', 'notes', 'created_at', 'updated_at'],
  Event_Speakers: ['event_speaker_id', 'event_id', 'speaker_id', 'invitation_status', 'notes', 'created_at', 'updated_at'],
  Event_Posters: ['poster_id', 'event_id', 'title', 'drive_url', 'status', 'notes', 'created_at', 'updated_at'],
  Event_Tasks: ['task_id', 'event_id', 'task_name', 'description', 'assignee_member_id', 'due_date', 'priority', 'status', 'notes', 'generated_from_template_id', 'due_date_offset_days', 'created_at', 'updated_at'],
  Task_Templates: ['template_id', 'task_name', 'description', 'assignee_member_id', 'offset_days', 'priority', 'active', 'created_at', 'updated_at'],
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
  Event_Posters: 'poster_id', Event_Tasks: 'task_id', Task_Templates: 'template_id', Meetings: 'meeting_id', Committee: 'member_id', Event_Attendance: 'attendance_id', Organisations: 'organisation_id',
  Event_Organisations: 'event_organisation_id', Funding: 'funding_id', Venues: 'venue_id',
  Event_Checklist: 'checklist_id'
};

const DEFAULT_TASK_TEMPLATES = [
  { template_id: 'template_default_event_plan', task_name: 'Agree event plan and approval', description: 'Confirm the event purpose, intended audience, format and committee approval.', offset_days: -90, priority: 'High', role_terms: ['president', 'chair'] },
  { template_id: 'template_default_budget', task_name: 'Confirm food budget', description: 'Agree the event budget, funding sources and spending approvals.', offset_days: -60, priority: 'High', task_terms: ['budget', 'funding'], role_terms: ['president', 'treasurer'] },
  { template_id: 'template_default_venue', task_name: 'Confirm venue and room booking', description: 'Book a suitable room and confirm capacity, access and venue arrangements.', offset_days: -60, priority: 'High' },
  { template_id: 'template_default_speakers', task_name: 'Confirm speakers', description: 'Invite and confirm speakers, titles, organisations and contact details.', offset_days: -45, priority: 'High', task_terms: ['speaker'] },
  { template_id: 'template_default_programme', task_name: 'Finalise event programme and run sheet', description: 'Confirm timings, introductions, speaker order, questions and responsibilities.', offset_days: -14, priority: 'High' },
  { template_id: 'template_default_registration', task_name: 'Set up event registration', description: 'Create the registration link and confirm capacity and attendee information.', offset_days: -35, priority: 'High' },
  { template_id: 'template_default_posters', task_name: 'Posters', description: 'Prepare and approve the event poster and save its Google Drive link in the event.', offset_days: -35, priority: 'High', task_terms: ['poster'] },
  { template_id: 'template_default_publicity', task_name: 'Launch event publicity', description: 'Publish the event through YEN channels and partner organisations.', offset_days: -28, priority: 'High', task_terms: ['poster', 'publicity', 'promotion'] },
  { template_id: 'template_default_academics', task_name: 'Spread poster to academics ahead of event', description: 'Share the approved poster with relevant academics and university contacts.', offset_days: -21, priority: 'Normal', task_terms: ['academics'] },
  { template_id: 'template_default_attendees', task_name: 'Review registrations and attendee numbers', description: 'Check registrations against capacity and identify any attendee follow-up needed.', offset_days: -7, priority: 'Normal' },
  { template_id: 'template_default_equipment', task_name: 'Confirm equipment and event materials', description: 'Check presentation equipment, microphones, signs and other event materials.', offset_days: -7, priority: 'High' },
  { template_id: 'template_default_roles', task_name: 'Confirm committee attendance and event-day roles', description: 'Assign setup, welcome, registration, timekeeping and close-down responsibilities.', offset_days: -5, priority: 'High', role_terms: ['president', 'secretary'] },
  { template_id: 'template_default_final_checks', task_name: 'Complete final event checks', description: 'Reconfirm venue, speakers, catering, registrations, publicity and the run sheet.', offset_days: -3, priority: 'Urgent' },
  { template_id: 'template_default_reminder', task_name: 'Send final attendee reminder', description: 'Send attendees the final time, location, access details and registration information.', offset_days: -2, priority: 'Normal', role_terms: ['secretary'] },
  { template_id: 'template_default_setup', task_name: 'Event-day setup and attendee check-in', description: 'Set up the venue and materials and manage attendee arrival and registration.', offset_days: 0, priority: 'Urgent' },
  { template_id: 'template_default_delivery', task_name: 'Deliver event-day run sheet responsibilities', description: 'Complete assigned hosting, speaker support, timekeeping and close-down duties.', offset_days: 0, priority: 'Urgent' },
  { template_id: 'template_default_follow_up', task_name: 'Send follow-up and thank-you messages', description: 'Thank speakers, partner organisations and attendees and share any agreed follow-up.', offset_days: 2, priority: 'Normal', role_terms: ['secretary'] },
  { template_id: 'template_default_outcomes', task_name: 'Record attendance and event outcomes', description: 'Record final attendance, key outcomes, links and notes for committee records.', offset_days: 3, priority: 'Normal', role_terms: ['secretary'] },
  { template_id: 'template_default_debrief', task_name: 'Hold event debrief', description: 'Review what worked, record lessons and agree any outstanding actions.', offset_days: 7, priority: 'Normal', role_terms: ['president', 'chair'] }
];

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
  const seeded = seedDefaultTaskTemplates_(spreadsheet);
  return 'Created/verified ' + Object.keys(SCHEMA).length + ' data tabs.' + (seeded ? ' Added ' + seeded + ' starter task templates.' : '');
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
    if (action === 'createEventWithAutomation') return withLock_(function () { return json_({ ok: true, data: createEventWithAutomation_(body.event || {}) }); });
    if (action === 'saveEventDetail') return withLock_(function () { return json_({ ok: true, data: saveEventDetail_(body || {}) }); });
    if (action === 'deleteEvent') return withLock_(function () { return json_({ ok: true, data: deleteEvent_(body.event_id) }); });
    if (action === 'saveCommittee') return withLock_(function () { return json_({ ok: true, data: saveCommittee_(body.member || {}) }); });
    if (action === 'saveOrganisation') return withLock_(function () { return json_({ ok: true, data: saveOrganisation_(body.organisation || {}) }); });
    if (action === 'saveMeeting') return withLock_(function () { return json_({ ok: true, data: saveMeeting_(body.meeting || {}) }); });
    if (action === 'deleteMeeting') return withLock_(function () { return json_({ ok: true, data: deleteMeeting_(body.meeting_id) }); });
    if (action === 'saveTaskTemplate') return withLock_(function () { return json_({ ok: true, data: saveTaskTemplate_(body.template || {}) }); });
    if (action === 'deleteTaskTemplate') return withLock_(function () { return json_({ ok: true, data: deleteTaskTemplate_(body.template_id) }); });
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
  return { events: events, committee: tables.Committee, organisations: tables.Organisations, meetings: tables.Meetings, tasks: tables.Event_Tasks, task_templates: tables.Task_Templates };
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

function createEventWithAutomation_(event) {
  if (!String(event.event_name || '').trim()) throw new Error('Event name is required.');
  if (!event.date) throw new Error('An event date is required to calculate automated task deadlines.');
  const spreadsheet = getSpreadsheet_();
  const events = readTableFromSheet_(getSheet_('Events', spreadsheet), 'Events');
  const templates = readTableFromSheet_(getSheet_('Task_Templates', spreadsheet), 'Task_Templates');
  const tasks = readTableFromSheet_(getSheet_('Event_Tasks', spreadsheet), 'Event_Tasks');
  const committee = readTableFromSheet_(getSheet_('Committee', spreadsheet), 'Committee');
  const activeTemplates = templates.filter(function (template) { return String(template.active).toLowerCase() !== 'false'; });
  const activeMemberIds = committee.filter(function (member) { return String(member.active).toLowerCase() !== 'false'; }).map(function (member) { return member.member_id; });
  if (!activeTemplates.length) throw new Error('No active task automation templates are configured.');
  const now = new Date().toISOString();
  event.event_id = event.event_id || makeId_('event');
  const saved = upsertInMemory_('Events', events, event, now);
  const generated = generateAutomatedTasksInMemory_(tasks, saved, activeTemplates, now, activeMemberIds);
  writeTable_('Events', events, spreadsheet);
  writeTable_('Event_Tasks', tasks, spreadsheet);
  return { event: saved, tasks: generated };
}

function saveEventDetail_(payload) {
  const spreadsheet = getSpreadsheet_();
  const tables = readTables_(Object.keys(SCHEMA), spreadsheet);
  const now = new Date().toISOString();
  const eventInput = payload.event || {};
  if (!String(eventInput.event_name || '').trim()) throw new Error('Event name is required.');
  eventInput.event_id = eventInput.event_id || makeId_('event');
  const existingEvent = tables.Events.find(function (row) { return row.event_id === eventInput.event_id; }) || {};
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
  if (payload.update_automated_task_deadlines && event.date && event.date !== existingEvent.date) {
    updateAutomatedTaskDeadlinesInMemory_(tables.Event_Tasks, eventId, event.date, now);
    writeTable_('Event_Tasks', tables.Event_Tasks, spreadsheet);
  }
  return buildEventDetail_(event, tables);
}

function deleteEvent_(eventId) {
  if (!eventId) throw new Error('event_id is required.');
  const spreadsheet = getSpreadsheet_();
  const tables = readTables_(Object.keys(SCHEMA), spreadsheet);
  deleteEventFromTables_(tables, eventId);
  ['Events', 'Speakers', 'Event_Speakers', 'Event_Posters', 'Event_Tasks', 'Event_Attendance', 'Event_Organisations', 'Funding', 'Venues', 'Event_Checklist'].forEach(function (name) {
    writeTable_(name, tables[name], spreadsheet);
  });
  return { event_id: eventId };
}

function deleteEventFromTables_(tables, eventId) {
  if (!tables.Events.some(function (row) { return row.event_id === eventId; })) throw new Error('Event not found.');
  const linkedSpeakerIds = tables.Event_Speakers.filter(function (row) { return row.event_id === eventId; }).map(function (row) { return row.speaker_id; });
  tables.Events = tables.Events.filter(function (row) { return row.event_id !== eventId; });
  tables.Event_Speakers = tables.Event_Speakers.filter(function (row) { return row.event_id !== eventId; });
  const stillLinkedSpeakerIds = {};
  tables.Event_Speakers.forEach(function (row) { stillLinkedSpeakerIds[row.speaker_id] = true; });
  tables.Speakers = tables.Speakers.filter(function (row) { return linkedSpeakerIds.indexOf(row.speaker_id) === -1 || stillLinkedSpeakerIds[row.speaker_id]; });
  ['Event_Posters', 'Event_Tasks', 'Event_Attendance', 'Event_Organisations', 'Funding', 'Venues', 'Event_Checklist'].forEach(function (name) {
    tables[name] = tables[name].filter(function (row) { return row.event_id !== eventId; });
  });
  return tables;
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

function saveTaskTemplate_(template) {
  if (!String(template.task_name || '').trim()) throw new Error('Template task name is required.');
  const offset = Number(template.offset_days);
  if (!Number.isInteger(offset) || offset < -3650 || offset > 3650) throw new Error('Timing must be a whole number between -3650 and 3650 days.');
  const spreadsheet = getSpreadsheet_();
  const rows = readTableFromSheet_(getSheet_('Task_Templates', spreadsheet), 'Task_Templates');
  template.template_id = template.template_id || makeId_('template');
  template.offset_days = String(offset);
  template.priority = template.priority || 'Normal';
  if (template.active === undefined || template.active === '') template.active = 'true';
  const saved = upsertInMemory_('Task_Templates', rows, template, new Date().toISOString());
  writeTable_('Task_Templates', rows, spreadsheet);
  return saved;
}

function deleteTaskTemplate_(templateId) {
  if (!templateId) throw new Error('template_id is required.');
  const spreadsheet = getSpreadsheet_();
  const rows = readTableFromSheet_(getSheet_('Task_Templates', spreadsheet), 'Task_Templates');
  const remaining = rows.filter(function (row) { return row.template_id !== templateId; });
  if (remaining.length === rows.length) throw new Error('Task template not found.');
  writeTable_('Task_Templates', remaining, spreadsheet);
  return { template_id: templateId };
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

function generateAutomatedTasksInMemory_(tasks, event, templates, now, activeMemberIds) {
  const generated = [];
  templates.forEach(function (template) {
    const existing = tasks.find(function (task) {
      return task.event_id === event.event_id && task.generated_from_template_id === template.template_id;
    });
    if (existing) { generated.push(existing); return; }
    const offset = Number(template.offset_days || 0);
    const assigned = template.assignee_member_id && (!activeMemberIds || activeMemberIds.indexOf(template.assignee_member_id) !== -1) ? template.assignee_member_id : '';
    const task = {
      task_id: 'task_auto_' + event.event_id + '_' + template.template_id,
      event_id: event.event_id,
      task_name: template.task_name,
      description: template.description,
      assignee_member_id: assigned,
      due_date: addDays_(event.date, offset),
      priority: template.priority || 'Normal',
      status: 'Not started',
      notes: '',
      generated_from_template_id: template.template_id,
      due_date_offset_days: String(offset)
    };
    generated.push(upsertInMemory_('Event_Tasks', tasks, task, now));
  });
  return generated;
}

function updateAutomatedTaskDeadlinesInMemory_(tasks, eventId, eventDate, now) {
  return tasks.filter(function (task) {
    return task.event_id === eventId && task.generated_from_template_id && task.status !== 'Complete';
  }).map(function (task) {
    task.due_date = addDays_(eventDate, Number(task.due_date_offset_days || 0));
    task.updated_at = now;
    return task;
  });
}

function addDays_(dateValue, offsetDays) {
  const date = new Date(String(dateValue) + 'T00:00:00Z');
  if (isNaN(date.getTime())) throw new Error('A valid event date is required.');
  date.setUTCDate(date.getUTCDate() + Number(offsetDays || 0));
  return date.toISOString().slice(0, 10);
}

function seedDefaultTaskTemplates_(spreadsheet) {
  const sheet = getSheet_('Task_Templates', spreadsheet);
  if (sheet.getLastRow() >= 2) return 0;
  const committee = readTableFromSheet_(getSheet_('Committee', spreadsheet), 'Committee');
  const tasks = readTableFromSheet_(getSheet_('Event_Tasks', spreadsheet), 'Event_Tasks');
  const now = new Date().toISOString();
  const rows = DEFAULT_TASK_TEMPLATES.map(function (definition) {
    return {
      template_id: definition.template_id,
      task_name: definition.task_name,
      description: definition.description,
      assignee_member_id: inferTemplateAssignee_(definition, tasks, committee),
      offset_days: String(definition.offset_days),
      priority: definition.priority,
      active: 'true',
      created_at: now,
      updated_at: now
    };
  });
  writeTable_('Task_Templates', rows, spreadsheet);
  return rows.length;
}

function inferTemplateAssignee_(definition, tasks, committee) {
  const activeIds = {};
  committee.forEach(function (member) {
    if (String(member.active).toLowerCase() !== 'false') activeIds[member.member_id] = true;
  });
  const taskTerms = definition.task_terms || [];
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    const task = tasks[index];
    const name = String(task.task_name || '').toLowerCase();
    if (task.assignee_member_id && activeIds[task.assignee_member_id] && taskTerms.some(function (term) { return name.indexOf(term) !== -1; })) return task.assignee_member_id;
  }
  const roleTerms = definition.role_terms || [];
  const member = committee.find(function (row) {
    const role = String(row.role || '').toLowerCase();
    return activeIds[row.member_id] && roleTerms.some(function (term) { return role.indexOf(term) !== -1; });
  });
  return member ? member.member_id : '';
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
