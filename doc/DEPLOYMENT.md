# Deployment Guide

Follow these steps to deploy the application to another server.

## 1. Prerequisites
Ensure the target server has **Node.js** installed (version 18+ recommended).

## 2. Prepare files for transfer
You need to move the following files and directories to the new server. Create a folder on the new server (e.g., `lots-app`) and upload these items into it:

*   **`dist/`** (This folder contains the built frontend application)
*   **`server/`** (This folder contains the backend API code)
*   **`calendar.db`** (The database file - make sure it is in the root alongside `server/`)
*   **`package.json`**
*   **`package-lock.json`**

**Do NOT** upload `node_modules`. We will install dependencies fresh on the server.

The structure on the server should look like this:
```
lots-app/
├── calendar.db
├── dist/
│   ├── index.html
│   └── assets/
├── package.json
├── package-lock.json
└── server/
    └── index.js
```

## 3. Install Dependencies
Open a terminal on the server, navigate to the folder where you uploaded the files, and run:

```bash
npm install --omit=dev
```
This will install the necessary packages (`express`, `sqlite3`, `cors`, etc.) to run the server.

## 4. Start the Application
To start the server, run:

```bash
node server/index.js
```

The application should now be running.
If you stick to the default port, it will be available at: `http://<server-ip>:3001`

## 5. (Optional) Run in Background
To keep the app running even if you close the terminal, use a process manager like PM2.

1.  Install PM2 globally: `npm install -g pm2`
2.  Start the app: `pm2 start server/index.js --name "lots-app"`
3.  Save the list so it restarts on reboot: `pm2 save`
