# YEN Event Manager

A shared, responsive event-management system for the Young Economists Network Organising Committee.

The browser interface is hosted by GitHub Pages. It reads and writes JSON through a Google Apps Script web app, and Apps Script stores relational records in separate tabs of one Google Sheet. No event data is stored in the repository or in browser `localStorage`.

## What is included

- Dashboard with readiness percentage, funding, speaker, venue and attendance summaries
- Upcoming, past and cancelled event views with search and filters
- Flexible event creation (only a name is required)
- One event workspace for details, funding sources, speakers, poster Drive links, venue, partner organisations, committee attendance and preparation checklist
- Committee task management with assignees, event links, due dates, priorities, progress statuses and member filtering
- Reusable committee and organisation directories with inactive/archive states
- Stable record IDs and retained historical records
- Explicit shared-save status, retryable errors, loading and empty states
- Mobile layouts that turn wide event tables into readable labelled cards
- Apps Script setup function that creates every required Sheet tab and header

## Architecture

```text
Committee member
      │
      ▼
GitHub Pages (HTML/CSS/JavaScript)
      │ JSON over HTTPS
      ▼
Google Apps Script web app
      │
      ▼
Google Sheet
  ├─ Events
  ├─ Speakers
  ├─ Event_Speakers
  ├─ Event_Posters
  ├─ Event_Tasks
  ├─ Committee
  ├─ Event_Attendance
  ├─ Organisations
  ├─ Event_Organisations
  ├─ Funding
  ├─ Venues
  └─ Event_Checklist
```

## Deploy the shared data service

These steps require the Google account that will own the YEN data.

### 1. Create the Google Sheet

1. In Google Drive, create a blank Google Sheet. A name such as **YEN Event Manager Data** is useful.
2. Decide who should own it. An enduring YEN/ESA organisational account is preferable to a temporary committee member's personal account.
3. Share the Sheet with any administrators who should have direct spreadsheet access. Ordinary users should use the website and do not need to edit raw tabs.

Do not manually create tabs or columns. The supplied setup function does it consistently.

### 2. Create the bound Apps Script project

1. Open the new Sheet.
2. Select **Extensions → Apps Script**.
3. Rename the project to **YEN Event Manager API**.
4. Open the default `Code.gs` file, remove its placeholder contents, then copy in the complete contents of [`apps-script/Code.gs`](apps-script/Code.gs).
5. Click **Save**.

### 3. Initialise the schema

1. In the function selector at the top of Apps Script, select `setupSpreadsheet`.
2. Click **Run**.
3. Google will ask for permission to edit the Sheet. Choose the Sheet owner's account, review the requested access, and allow it.
4. Return to the Sheet. It should now contain the twelve tabs listed above, each with a dark-blue header row.
5. The execution result should say that twelve data tabs were created or verified.

The function is safe to run again: it reuses existing tabs and does not erase data. It stores the Sheet ID in Apps Script's private Script Properties, not in this repository.

### 4. Deploy Apps Script as a web app

1. In Apps Script, click **Deploy → New deployment**.
2. Click the gear beside **Select type**, then choose **Web app**.
3. Use a description such as `Initial YEN Event Manager API`.
4. For **Execute as**, choose **Me** (the Sheet owner).
5. For **Who has access**, choose the narrowest option that still works:
   - **Anyone** is the most compatible with a public GitHub Pages frontend, but anyone who obtains the URL can read and modify the event data.
   - **Anyone with Google account** may require users to be signed in and can be affected by browser cross-site authentication restrictions. Test it with the deployed site before relying on it.
   - A Google Workspace domain-only option is preferable when all organisers belong to the same managed domain and the administrator permits it.
6. Click **Deploy**, authorize if prompted, and copy the URL ending in `/exec` (not the `/dev` test URL).

### 5. Connect the frontend

Open [`js/config.js`](js/config.js) and replace:

```js
API_URL: 'PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE'
```

with the copied `/exec` URL. Commit and push that one-line change. The deployment URL is not a password, but it is the API address; do not put passwords, OAuth tokens, Sheet IDs or other secrets in this file.

### 6. Enable GitHub Pages

1. Open the GitHub repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **main**, folder **/(root)**, then click **Save**.
5. Wait for GitHub to show the published URL, normally `https://sfox2006.github.io/YEN-Event-Manager/`.

No compilation or build command is required.

## Verify reading and writing

### Quick connection test

Open the Apps Script `/exec` URL directly. A healthy deployment returns JSON similar to:

```json
{"ok":true,"data":{"service":"YEN Event Manager API","status":"ready"}}
```

Then open the GitHub Pages site. The yellow “not connected” notice should be gone. An empty dashboard is expected before the first event is created.

### Acceptance workflow

1. Add committee members and at least two organisations from their directory pages.
2. Create an event named **Test Event**, with a date and time, and save it.
3. Refresh; verify the event remains.
4. Open it and add three speakers. Set two to **Confirmed** and one to **Invited**.
5. Add a funding source with status **Confirmed**.
6. Enter a venue and set its booking status to **Confirmed**.
7. Associate two organisations.
8. Set several attendance rows to **Confirmed attending** and others to **Awaiting response**.
9. Mark some checklist items complete or not applicable, then click **Save all changes**.
10. Refresh the event. Confirm all fields remain and the dashboard shows **2/3** speakers.
11. Change the event name or notes, save, refresh and confirm the edit persists.
12. Open the Pages URL in a different browser or private session and confirm the same event loads.
13. Set its date in the past (or status to **Completed**) and confirm it remains under **Events → Past**.
14. Add a task, assign it to a committee member and link it to Test Event.
15. Change its status from the Tasks tab and verify the update persists after refresh.
16. Delete the test task and confirm it is removed.

Automated checks cover readiness calculations, event classification, task relationships and stable IDs. Steps involving the live Google deployment must be run after the Sheet owner authorizes Apps Script.

## Updating the API

Editing `Code.gs` does not automatically update an existing web-app deployment.

1. Copy the new `Code.gs` into Apps Script and save.
2. Choose **Deploy → Manage deployments**.
3. Edit the active deployment, select **New version**, add a description and deploy.
4. Keep the same `/exec` URL unless you deliberately create a separate deployment.

## Current security model

This project deliberately does not implement a custom username/password system. A password embedded in frontend JavaScript would be visible to every visitor and provide false confidence.

With **Execute as me / Anyone**, the Apps Script URL is effectively a bearer capability: a person who knows it can use the API. An obscure URL is not strong authentication. Use this only if the event data is low sensitivity and the risk is acceptable. Prefer a domain-restricted Google Workspace deployment when available. For stronger access control across mixed Google accounts, place an authenticated service in front of the data API; `api.js` isolates network access so the backend can be substituted later.

Do not store personal or sensitive speaker contact details until the committee has approved the deployment's access model and data handling.

## Troubleshooting

### The site says the shared data service is not connected

- Confirm `js/config.js` contains the deployed URL ending in `/exec`.
- Confirm that change was pushed to the branch used by GitHub Pages.
- Hard-refresh after the Pages deployment finishes.

### “Spreadsheet is not initialised”

- Run `setupSpreadsheet` once from the Apps Script editor opened through the target Sheet.
- Confirm the script is bound to that Sheet, rather than created as an unrelated standalone project.

### Missing sheet tab

- Run `setupSpreadsheet` again. Do not rename the generated data tabs.

### The `/exec` URL asks for access or redirects to sign-in

- Recheck **Who has access** in the web-app deployment.
- Test in the same browser that will open the GitHub Pages site.
- If anonymous deployments are disallowed, use a domain-only deployment and test with a signed-in domain account.

### Reads work but recent code changes do not

- Create a new version under **Manage deployments**. Saving `Code.gs` alone only changes the editor version.

### Saving fails or times out

- Open **Executions** in Apps Script and inspect the newest failed execution.
- Confirm the Sheet owner still has edit access and no generated header tab was renamed.
- Retry once; simultaneous writes are serialized with Apps Script's script lock.

### Browser shows a CORS or HTML/JSON parsing error

- Use the deployed `/exec` URL, not `/dev`.
- Confirm the deployment is accessible to the current user.
- Open `/exec` directly and verify it returns health JSON rather than a sign-in or permission page.

### GitHub Pages shows a 404

- Confirm Pages is enabled from the `main` branch and root folder.
- Repository and URL capitalization must match `YEN-Event-Manager`.
- Allow a few minutes for the initial deployment.

## Local checks

The site has no runtime dependencies. With Node 20 or newer:

```bash
npm test
npm run check
```

To preview locally, serve the repository root with any static server (opening `index.html` directly may block JavaScript modules):

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. Shared reads and writes still go to the configured Apps Script URL.

## Repository layout

```text
├── index.html
├── css/styles.css
├── js/
│   ├── app.js
│   ├── api.js
│   ├── config.js
│   └── utils.js
├── apps-script/Code.gs
├── tests/utils.test.js
├── package.json
└── README.md
```
