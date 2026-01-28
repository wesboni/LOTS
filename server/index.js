const express = require('express');
const https = require('https');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3001;

// Middleware Configuration
// -----------------------------------------------------------------------------
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies (Required for Azure AD form_post)
app.use(express.static(path.join(__dirname, '../dist'))); // Serve static files from the build directory

// DEBUG: Log all requests
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

const dotenvResult = require('dotenv').config({ path: path.join(__dirname, '../.env') });
if (dotenvResult.error) {
    console.error("DOTENV ERROR:", dotenvResult.error);
} else {
    console.log("DOTENV loaded successfully.");
}

console.log("--- DEBUG: Configuration Checks ---");
console.log("TENANT_ID:", process.env.TENANT_ID ? "Exists" : "MISSING");
console.log("CLIENT_ID:", process.env.CLIENT_ID ? "Exists" : "MISSING");
console.log("CLIENT_SECRET:", process.env.CLIENT_SECRET ? "Exists" : "MISSING");
console.log("REDIRECT_URL:", process.env.REDIRECT_URL);
console.log("SESSION_SECRET:", process.env.SESSION_SECRET ? "Exists" : "MISSING");
console.log("-----------------------------------");
const passport = require('passport');
const OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
const session = require('express-session');
const cookieParser = require('cookie-parser');

// === SSO CONFIGURATION ===
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET || 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

// Configure Passport with Azure credentials
// This strategy handles the OIDC flow with Azure AD
passport.use(new OIDCStrategy({
    identityMetadata: `https://login.microsoftonline.com/${process.env.TENANT_ID}/v2.0/.well-known/openid-configuration`,
    clientID: process.env.CLIENT_ID,
    responseType: 'code id_token',
    responseMode: 'form_post',
    redirectUrl: process.env.REDIRECT_URL,
    allowHttpForRedirectUrl: true,
    clientSecret: process.env.CLIENT_SECRET,
    validateIssuer: false, // Set to true in production if needed
    passReqToCallback: false,
    // Reduce scope to minimum to try and avoid Admin Consent
    scope: ['profile', 'openid', 'email'],
    loggingLevel: 'info',
    loggingNoPII: false
},
    (iss, sub, profile, accessToken, refreshToken, done) => {
        if (!profile.displayName) {
            return done(new Error("No displayName found"), null);
        }
        // User processing logic (e.g., save to DB) can go here
        return done(null, profile);
    }));

/* ===================== AUTH ROUTES ===================== */
// Route to initiate login process
app.get('/login',
    (req, res, next) => {
        console.log("Received /login request");
        try {
            passport.authenticate('azuread-openidconnect', {
                response: res,
                failureRedirect: '/'
            })(req, res, next);
        } catch (err) {
            console.error("ERROR in /login passport.authenticate:", err);
            res.status(500).send("Login Configuration Error: " + err.message);
        }
    }
);

app.post('/auth/callback',
    (req, res, next) => {
        console.log("Processing Auth Callback...");
        console.log("Callback Body:", req.body);
        passport.authenticate('azuread-openidconnect', {
            response: res,
            failureRedirect: '/',
            successRedirect: '/'
        })(req, res, next);
    }
);

// Logout route: destroys session and redirects to home
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        req.logout(() => {
            res.redirect('/');
        });
    });
});

// API to check current authentication status and get user details
app.get('/api/me', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            authenticated: true,
            user: {
                name: req.user.displayName,
                email: req.user._json.email || req.user._json.preferred_username
            }
        });
    } else {
        res.json({ authenticated: false });
    }
});

const dbPath = path.resolve(__dirname, '../calendar.db');

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

// Initialize SQLite Database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening DB:', err.message);
    } else {
        console.log('Connected to SQLite database.');

        // Initialize 'events' table if it doesn't exist
        db.run(`
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_name TEXT,
                type TEXT,
                date TEXT,
                start_time TEXT,
                finish_time TEXT,
                duration NUMERIC,
                comment TEXT DEFAULT '',
                situation TEXT DEFAULT 'Approved',
                status TEXT,
                original_data TEXT
            )
        `, (err) => {
            if (err) {
                // Handle potential errors like table already exists but schema differs (not auto-migrated here)
            }
            // Ensure 'original_data' column exists (migration helper)
            db.all("PRAGMA table_info(events)", (err, cols) => {
                if (!err && cols) {
                    const hasCol = cols.some(c => c.name === 'original_data');
                    if (!hasCol) {
                        console.log("Adding missing column 'original_data'...");
                        db.run("ALTER TABLE events ADD COLUMN original_data TEXT", err => {
                            if (err) console.error("Error adding original_data:", err.message);
                        });
                    }
                }
            });
        });
    }
});

/* ===================== ALL DATA ===================== */
app.get('/api/all-data', (req, res) => {
    const sql = `SELECT * FROM events ORDER BY date, employee_name, type`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({
            message: 'success',
            data: rows
        });
    });
});

/* ===================== SAVE EVENTS (Upsert/Delete) ===================== */
app.post('/api/save-events', (req, res) => {
    console.log("DEBUG: /api/save-events HIT");

    // Log truncated body for debug
    console.log("Request Body:", JSON.stringify(req.body).substring(0, 100) + "...");

    const events = req.body; // Expecting an Array of event objects
    if (!Array.isArray(events)) {
        console.error("DEBUG: Body is not an array:", req.body);
        return res.status(400).json({ error: "Expected an array of events" });
    }

    // 1. Identify IDs to update so we can fetch current state for history
    const updateIds = events
        .filter(e => e.id && e.situation !== 'Added' && e.situation !== 'HardDelete')
        .map(e => e.id);

    // Helper to get current rows
    const fetchCurrentRows = () => new Promise((resolve, reject) => {
        if (updateIds.length === 0) return resolve({});
        const placeholders = updateIds.map(() => '?').join(',');
        db.all(`SELECT * FROM events WHERE id IN (${placeholders})`, updateIds, (err, rows) => {
            if (err) reject(err);
            else {
                const map = {};
                rows.forEach(r => map[r.id] = r);
                resolve(map);
            }
        });
    });

    fetchCurrentRows().then(currentMap => {
        db.serialize(() => {
            db.exec("BEGIN TRANSACTION");

            const stmtInsert = db.prepare(`
                INSERT INTO events (employee_name, type, date, start_time, finish_time, duration, comment, situation, status, original_data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const stmtUpdate = db.prepare(`
                UPDATE events
                SET employee_name = ?, type = ?, date = ?, start_time = ?, finish_time = ?, duration = ?, comment = ?, situation = ?, status = ?, original_data = ?
                WHERE id = ?
            `);

            const runAsync = (stmt, params) => new Promise((resolve, reject) => {
                stmt.run(params, function (err) {
                    if (err) reject(err);
                    else resolve(this);
                });
            });

            const promises = [];

            events.forEach(ev => {
                if (ev.situation === 'Deleted' && ev.id) {
                    const stmt = db.prepare("UPDATE events SET situation = 'Deleted' WHERE id = ?");
                    promises.push(runAsync(stmt, [ev.id]).then(() => stmt.finalize()));
                } else if (ev.situation === 'HardDelete' && ev.id) {
                    const stmt = db.prepare("DELETE FROM events WHERE id = ?");
                    promises.push(runAsync(stmt, [ev.id]).then(() => stmt.finalize()));
                } else if (ev.id) {
                    const current = currentMap[ev.id];
                    let originalDataStr = null;
                    if (current) {
                        if (current.situation === 'Approved') {
                            originalDataStr = JSON.stringify(current);
                        } else if (current.situation === 'Updated' && current.original_data) {
                            originalDataStr = current.original_data;
                        } else if (current.original_data) {
                            originalDataStr = current.original_data;
                        }
                    }
                    promises.push(runAsync(stmtUpdate, [
                        ev.employee_name, ev.type, ev.date, ev.start_time, ev.finish_time, ev.duration, ev.comment, ev.situation, ev.status, originalDataStr, ev.id
                    ]));
                } else {
                    promises.push(runAsync(stmtInsert, [
                        ev.employee_name, ev.type, ev.date, ev.start_time, ev.finish_time, ev.duration, ev.comment, ev.situation, ev.status, null
                    ]));
                }
            });

            Promise.all(promises)
                .then(() => {
                    stmtInsert.finalize();
                    stmtUpdate.finalize();
                    db.exec("COMMIT", (err) => {
                        if (err) {
                            console.error("COMMIT Error:", err);
                            res.status(500).json({ error: "Commit failed" });
                        } else {
                            res.json({ message: "success" });
                        }
                    });
                })
                .catch(err => {
                    console.error("Transaction Error:", err);
                    db.exec("ROLLBACK");
                    stmtInsert.finalize();
                    stmtUpdate.finalize();
                    res.status(500).json({ error: "Failed to save events: " + err.message });
                });
        });
    }).catch(err => {
        res.status(500).json({ error: "Failed to fetch current state: " + err.message });
    });
});


/* ===================== APPROVE EVENTS ===================== */
app.post('/api/approve-events', (req, res) => {
    const { ids } = req.body; // Array of IDs
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Expected array of IDs" });
    }

    // 1. Fetch items to see which are 'Deleted' to hard delete them
    // 2. Others update to 'Approved' and clear 'original_data'

    const placeholders = ids.map(() => '?').join(',');
    const sqlFetch = `SELECT id, situation FROM events WHERE id IN (${placeholders})`;

    db.all(sqlFetch, ids, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const idsToDelete = rows.filter(r => r.situation === 'Deleted').map(r => r.id);
        const idsToApprove = rows.filter(r => r.situation !== 'Deleted').map(r => r.id);

        db.serialize(() => {
            db.exec("BEGIN TRANSACTION");

            const promises = [];

            if (idsToDelete.length > 0) {
                const pDel = idsToDelete.map(() => '?').join(',');
                const stmtDel = db.prepare(`DELETE FROM events WHERE id IN (${pDel})`);
                promises.push(new Promise((resolve, reject) => {
                    stmtDel.run(idsToDelete, (err) => {
                        if (err) reject(err); else resolve();
                    });
                }));
            }

            if (idsToApprove.length > 0) {
                const pApp = idsToApprove.map(() => '?').join(',');
                // Clear original_data on approval
                const stmtApp = db.prepare(`UPDATE events SET situation = 'Approved', original_data = NULL WHERE id IN (${pApp})`);
                promises.push(new Promise((resolve, reject) => {
                    stmtApp.run(idsToApprove, (err) => {
                        if (err) reject(err); else resolve();
                    });
                }));
            }

            Promise.all(promises)
                .then(() => {
                    db.exec("COMMIT", (err) => {
                        if (err) return res.status(500).json({ error: "Commit failed" });
                        res.json({ message: "success" });
                    });
                })
                .catch(err => {
                    db.exec("ROLLBACK");
                    res.status(500).json({ error: "Approval failed: " + err.message });
                });
        });
    });
});

/* ===================== REJECT EVENTS ===================== */
// Handles rejection of events: Adds -> Delete, Deletes -> Restore, Updates -> Revert
app.post('/api/reject-events', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Expected array of IDs" });
    }

    const placeholders = ids.map(() => '?').join(',');
    console.log("DEBUG: Rejecting IDs:", ids);
    db.all(`SELECT * FROM events WHERE id IN (${placeholders})`, ids, (err, rows) => {
        if (err) {
            console.error("DEBUG: Reject Fetch Error:", err);
            return res.status(500).json({ error: err.message });
        }
        console.log("DEBUG: Reject Found Rows:", rows.length, rows.map(r => ({ id: r.id, situation: r.situation })));

        db.serialize(() => {
            db.exec("BEGIN TRANSACTION");
            const promises = [];
            const idsToDelete = [];
            const idsToRevertDeleted = [];

            rows.forEach(row => {
                if (row.situation === 'Added') {
                    // Added -> Reject = Delete
                    idsToDelete.push(row.id);
                } else if (row.situation === 'Deleted') {
                    // Deleted -> Reject = Restore to Approved (and keep status)
                    idsToRevertDeleted.push(row.id);
                } else if (row.situation === 'Updated') {
                    // Updated -> Reject = Restore from original_data
                    if (row.original_data) {
                        try {
                            const original = JSON.parse(row.original_data);
                            const stmt = db.prepare(`
                                UPDATE events 
                                SET employee_name=?, type=?, date=?, start_time=?, finish_time=?, duration=?, comment=?, situation='Approved', status=?, original_data=NULL
                                WHERE id=?
                            `);
                            promises.push(new Promise((resolve, reject) => {
                                stmt.run([
                                    original.employee_name, original.type, original.date, original.start_time, original.finish_time, original.duration, original.comment, original.status, row.id
                                ], (err) => {
                                    if (err) reject(err); else resolve();
                                });
                            }));
                        } catch (e) {
                            console.error("Error parsing original_data for id " + row.id, e);
                            // Fallback: just mark approved? No, keep as Updated if failed? 
                            // Or just set to Approved but keep current values? 
                            // Let's set to Approved to avoid getting stuck, but log error.
                        }
                    } else {
                        // No original data? Just set to Approved (keep current changes) or stuck?
                        // Let's assuming revert means revert to 'Approved' state.
                        promises.push(new Promise((resolve, reject) => {
                            db.run("UPDATE events SET situation='Approved' WHERE id=?", [row.id], (err) => {
                                if (err) reject(err); else resolve();
                            });
                        }));
                    }
                }
            });

            if (idsToDelete.length > 0) {
                const p = idsToDelete.map(() => '?').join(',');
                promises.push(new Promise((resolve, reject) => {
                    db.run(`DELETE FROM events WHERE id IN (${p})`, idsToDelete, (err) => {
                        if (err) reject(err); else resolve();
                    });
                }));
            }

            if (idsToRevertDeleted.length > 0) {
                const p = idsToRevertDeleted.map(() => '?').join(',');
                promises.push(new Promise((resolve, reject) => {
                    db.run(`UPDATE events SET situation='Approved' WHERE id IN (${p})`, idsToRevertDeleted, (err) => {
                        if (err) reject(err); else resolve();
                    });
                }));
            }

            Promise.all(promises)
                .then(() => {
                    db.exec("COMMIT", (err) => {
                        if (err) return res.status(500).json({ error: "Commit failed" });
                        res.json({ message: "success" });
                    });
                })
                .catch(err => {
                    console.error("Reject Error:", err);
                    db.exec("ROLLBACK");
                    res.status(500).json({ error: "Reject failed: " + err.message });
                });
        });
    });
});

/* ===================== EVENTS (AGGREGATED) ===================== */
app.get('/api/events', (req, res) => {
    const sql = `
        SELECT * FROM events
        ORDER BY date, start_time, employee_name
    `;
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        // DEBUG: Log Andre's events
        const andreEv = rows.filter(r => r.employee_name.includes('Andre') && r.date === '2025-01-06');
        if (andreEv.length > 0) {
            console.log("SERVER DEBUG /api/events Andre Jan 6:", andreEv);
        }

        res.json({
            message: 'success',
            data: rows
        });
    });
});

/* ===================== EMPLOYEES ===================== */
app.get('/api/employees', (req, res) => {
    const sql = `SELECT DISTINCT employee_name FROM events ORDER BY employee_name`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({
            message: 'success',
            data: rows.map(r => r.employee_name)
        });
    });
});

/* ===================== HOLIDAYS ===================== */
app.get('/api/holidays', (req, res) => {
    const sql = `SELECT * FROM holidays ORDER BY date`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            // Table might not exist yet if script hasn't run, return empty
            if (err.message.includes("no such table")) {
                res.json({ message: 'success', data: [] });
                return;
            }
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({
            message: 'success',
            data: rows
        });
    });
});

/* ===================== LEAVE DATA ===================== */
app.get('/api/leave-data', (req, res) => {
    const sql = `SELECT * FROM yearly_balances`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            if (err.message.includes("no such table")) {
                res.json({ message: 'success', data: [] });
                return;
            }
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({
            message: 'success',
            data: rows
        });
    });
});


/* ===================== YEARLY DATA ===================== */
app.get('/api/yearly-data', (req, res) => {
    const sql = `SELECT * FROM yearly_data`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({
            message: 'success',
            data: rows
        });
    });
});

/* ===================== CATCH-ALL FOR CLIENT ROUTING ===================== */
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.resolve(__dirname, '../dist/index.html'));
});

/* ===================== START SERVER ===================== */
const httpsOptions = {
    pfx: fs.readFileSync(path.join(__dirname, '../certs/server.pfx')),
    passphrase: 'password'
};

/* ===================== DAILY STATUS JOB ===================== */
function runDailyStatusUpdate() {
    console.log("[JOB] Running Daily Status Update...");
    const today = new Date().toISOString().split('T')[0];

    db.serialize(() => {
        // 1. OVERTIME is always Earned
        db.run("UPDATE events SET status = 'Earned' WHERE type = 'OVERTIME'", (err) => {
            if (err) console.error("[JOB] Error updating OVERTIME:", err.message);
        });

        // 2. Others: Taken if date <= today
        // We use the 'date' column which is stored as YYYY-MM-DD string.
        db.run(`UPDATE events SET status = 'Taken' WHERE type IN ('TOIL', 'PAID', 'SICK', 'MARRIAGE') AND date <= ?`, [today], (err) => {
            if (err) console.error("[JOB] Error updating Taken:", err.message);
        });

        // 3. Others: Planned if date > today
        db.run(`UPDATE events SET status = 'Planned' WHERE type IN ('TOIL', 'PAID', 'SICK', 'MARRIAGE') AND date > ?`, [today], (err) => {
            if (err) console.error("[JOB] Error updating Planned:", err.message);
        });
    });
}

// Schedule Job
// Run once on startup
runDailyStatusUpdate();

// Schedule for next midnight
const now = new Date();
const night = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // the next day, ...
    0, 0, 0 // ...at 00:00:00
);
const msToMidnight = night.getTime() - now.getTime();

setTimeout(() => {
    runDailyStatusUpdate();
    // Then run every 24 hours
    setInterval(runDailyStatusUpdate, 24 * 60 * 60 * 1000);
}, msToMidnight);


https.createServer(httpsOptions, app).listen(port, '0.0.0.0', () => {
    console.log(`Server running on https://localhost:${port} and https://10.122.21.43:${port}`);
});
