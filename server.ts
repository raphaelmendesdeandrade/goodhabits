import express from "express";
import { google } from "googleapis";
import cookieSession from "cookie-session";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- STARTUP LOGGING ---
const STARTUP_LOG = path.join(__dirname, "startup.log");
fs.writeFileSync(STARTUP_LOG, `!!! SERVER STARTUP AT ${new Date().toISOString()} !!!\n`);
const addStartupLog = (msg: string) => {
  fs.appendFileSync(STARTUP_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  console.log(msg);
};

addStartupLog("Initializing Express server...");

const app = express();
const PORT = 3000;

// --- GLOBAL ERROR CATCHING ---
process.on('uncaughtException', (err) => {
  addLog(`CRITICAL: Uncaught Exception: ${err.message}`);
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  addLog(`CRITICAL: Unhandled Rejection: ${reason}`);
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// --- SERVER LOG TRACKING ---
const serverLogs: string[] = [];
const LOG_FILE = path.join(__dirname, "server.log");
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, "");

const addLog = (msg: string) => {
  const log = `[${new Date().toISOString().split('T')[1].split('.')[0]}] ${msg}`;
  serverLogs.unshift(log);
  if (serverLogs.length > 100) serverLogs.pop();
  fs.appendFileSync(LOG_FILE, log + "\n");
  console.log(log);
};

// --- 0. API ROUTES ---
app.get("/api/health", (req, res) => {
  let baseUrl = process.env.APP_URL;
  if (baseUrl) {
    baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  } else if (req) {
    baseUrl = getBaseUrl(req);
  }
  
  if (baseUrl && !baseUrl.includes('localhost') && baseUrl.startsWith('http:')) {
    baseUrl = baseUrl.replace('http:', 'https:');
  }

  const redirectUri = `${baseUrl}/auth/google/callback`;

  addLog(`HEALTH hit from ${req.headers['host']}`);
  res.status(200).json({ 
    status: "ok", 
    version: "v11-sync-fix",
    config: {
      hasClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    },
    oauth: {
      currentBaseUrl: baseUrl,
      fullRedirectUri: redirectUri,
      envAppUrl: process.env.APP_URL,
    }
  });
});

app.get("/api/debug-logs", (req, res) => {
  try {
    const fileLogs = fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean).reverse().slice(0, 100);
    res.json({ logs: fileLogs });
  } catch (e) {
    res.json({ logs: serverLogs });
  }
});

// 1. MIDDLEWARE & LOGGING
app.use((req, res, next) => {
  addLog(`${req.method} ${req.url}`);
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Trust proxy is essential for cookies in iframes/behind proxies
app.set('trust proxy', 1);

app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'goal-tracker-secret'],
  maxAge: 24 * 60 * 60 * 1000,
  secure: true, // Required for SameSite=None
  sameSite: 'none', // Required for cross-origin iframe
  httpOnly: true,
}));

// 2. OAUTH & API CONFIG
const getBaseUrl = (req: express.Request) => {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string' ? forwardedProto : req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || req.get('host') || 'localhost:3000';
  return `${protocol}://${host}`;
};

const getOAuthClient = (req?: express.Request) => {
  // AI Studio provides APP_URL which is the external HTTPS URL.
  // We MUST prioritize this to avoid protocol mismatches (http vs https) behind proxies.
  let baseUrl = process.env.APP_URL;
  
  if (baseUrl) {
    baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  } else if (req) {
    baseUrl = getBaseUrl(req);
  } else {
    baseUrl = 'http://localhost:3000';
  }

  // Force HTTPS for the redirect URI if we are not on localhost
  // Google OAuth requires HTTPS for all redirect URIs except localhost.
  if (baseUrl && !baseUrl.includes('localhost') && baseUrl.startsWith('http:')) {
    baseUrl = baseUrl.replace('http:', 'https:');
  }
  
  const redirectUri = `${baseUrl}/auth/google/callback`;
  addLog(`[OAUTH] Final Redirect URI: ${redirectUri}`);
  
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
};

// 3. API ROUTES - Using explicit paths and app.all for maximum compatibility
const api = express.Router();

api.use((req, res, next) => {
  addLog(`[API ROUTER ENTER] ${req.method} ${req.url} (Original: ${req.originalUrl})`);
  next();
});

api.get(["/auth/google/url", "/auth/google/url/"], (req, res) => {
  try {
    console.log(`[API] Auth URL requested`);
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error("Google Client ID or Secret is missing in environment variables.");
    }
    const client = getOAuthClient(req);
    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
      prompt: 'consent'
    });
    res.json({ url });
  } catch (error: any) {
    console.error("[API] Auth URL Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate auth URL" });
  }
});

api.post(["/sheets/sync", "/sheets/sync/"], async (req, res) => {
  addLog(`[API] Sync route entered`);
  const { activities, tokens } = req.body;
  
  if (!activities) {
    addLog(`[SYNC] Error: No activities in body`);
    return res.status(400).json({ error: "No activities provided" });
  }
  
  if (!tokens) {
    addLog(`[SYNC] Error: No tokens in body`);
    return res.status(401).json({ error: "No tokens provided" });
  }

  addLog(`[SYNC] Initializing Google clients...`);
  const client = getOAuthClient(req);
  client.setCredentials(tokens);
  const sheets = google.sheets({ version: 'v4', auth: client });
  const drive = google.drive({ version: 'v3', auth: client });

  try {
    addLog(`[SYNC] Searching for spreadsheet...`);
    const search = await drive.files.list({
      q: "name = 'Raphael Goal Tracker' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      fields: 'files(id)',
      pageSize: 1
    });

    let spreadsheetId = search.data.files?.[0]?.id;
    let isNewFile = false;
    if (!spreadsheetId) {
      isNewFile = true;
      addLog(`[SYNC] Spreadsheet not found, creating new one...`);
      const ss = await sheets.spreadsheets.create({
        requestBody: { properties: { title: 'Raphael Goal Tracker' } }
      });
      spreadsheetId = ss.data.spreadsheetId;
      addLog(`[SYNC] Created new spreadsheet: ${spreadsheetId}`);
    } else {
      addLog(`[SYNC] Found existing spreadsheet: ${spreadsheetId}`);
    }

    addLog(`[SYNC] Preparing data for ${activities.length} activities...`);
    activities.forEach((a: any) => {
      addLog(`[SYNC] Activity: ${a.title} (ID: ${a.id}, Logs: ${Object.keys(a.logs || {}).length})`);
    });
    
    const values = [['Date', 'Activity ID', 'Title', 'Category', 'Completed', 'Duration (min)', 'Note', 'Subtasks Status']];
    activities.forEach((a: any) => {
      Object.entries(a.logs || {}).forEach(([date, log]: [string, any]) => {
        const subtasksStr = (a.subTasks || []).map((s: any) => 
          `${s.title}: ${log.subTaskStatus?.[s.id] ? 'DONE' : 'TODO'}`
        ).join(' | ');
        values.push([date, a.id, a.title, a.category, log.completed ? 'TRUE' : 'FALSE', log.duration || 0, log.note || '', subtasksStr]);
      });
    });

    if (values.length > 1) {
      const header = values.shift()!;
      values.sort((a, b) => b[0].localeCompare(a[0]));
      values.unshift(header);
    }

    addLog(`[SYNC] Updating spreadsheet values...`);
    const ssData = await sheets.spreadsheets.get({ spreadsheetId: spreadsheetId! });
    
    // 1. Update Logs Sheet (History)
    const logSheetName = 'Logs';
    let logSheet = ssData.data.sheets?.find(s => s.properties?.title === logSheetName);
    if (!logSheet) {
      addLog(`[SYNC] Creating 'Logs' sheet...`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheetId!,
        requestBody: { requests: [{ addSheet: { properties: { title: logSheetName } } }] }
      });
    }

    addLog(`[SYNC] Updating 'Logs' sheet (${values.length} rows) in ${spreadsheetId}...`);
    const logUpdateRes = await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId!,
      range: `${logSheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values }
    });
    addLog(`[SYNC] Logs update status: ${logUpdateRes.status}`);

    // 2. Update Goals Sheet (Master List)
    const goalSheetName = 'Goals';
    let goalSheet = ssData.data.sheets?.find(s => s.properties?.title === goalSheetName);
    if (!goalSheet) {
      addLog(`[SYNC] Creating 'Goals' sheet...`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheetId!,
        requestBody: { requests: [{ addSheet: { properties: { title: goalSheetName } } }] }
      });
    }

    const goalValues = [['ID', 'Title', 'Category', 'Days']];
    activities.forEach((a: any) => {
      goalValues.push([a.id, a.title, a.category, (a.days || []).join(', ')]);
    });

    addLog(`[SYNC] Updating 'Goals' sheet (${goalValues.length} rows) in ${spreadsheetId}...`);
    const goalUpdateRes = await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId!,
      range: `${goalSheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: goalValues }
    });
    addLog(`[SYNC] Goals update status: ${goalUpdateRes.status}`);

    addLog(`[SYNC] Sync complete!`);
    res.json({ 
      success: true, 
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      isNewFile
    });
  } catch (error: any) {
    addLog(`[SYNC] Error: ${error.message}`);
    console.error("[API] Sync Error:", error);
    res.status(500).json({ error: error.message });
  }
});

api.post(["/sheets/log-transcript", "/sheets/log-transcript/"], async (req, res) => {
  console.log(`[API] Log transcript requested`);
  const { transcript, tokens } = req.body;
  if (!tokens) return res.status(401).json({ error: "No tokens provided" });

  const client = getOAuthClient(req);
  client.setCredentials(tokens);
  const sheets = google.sheets({ version: 'v4', auth: client });
  const drive = google.drive({ version: 'v3', auth: client });

  try {
    const search = await drive.files.list({
      q: "name = 'Raphael Goal Tracker' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      fields: 'files(id)',
      pageSize: 1
    });

    const spreadsheetId = search.data.files?.[0]?.id;
    if (!spreadsheetId) return res.status(404).json({ error: "Spreadsheet not found" });

    const ssData = await sheets.spreadsheets.get({ spreadsheetId });
    let journalSheet = ssData.data.sheets?.find(s => s.properties?.title === 'Journal');

    if (!journalSheet) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: 'Journal' } } }] }
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Journal!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [['Timestamp', 'Transcript']] }
      });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Journal!A:B',
      valueInputOption: 'RAW',
      requestBody: { values: [[new Date().toISOString(), transcript]] }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[API] Journal Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Mount the API router
// --- FETCH FROM SHEETS ---
api.post(["/sheets/fetch", "/sheets/fetch/"], async (req, res) => {
  const { tokens } = req.body;
  if (!tokens) return res.status(401).json({ error: "No tokens provided" });

  const client = getOAuthClient(req);
  client.setCredentials(tokens);
  const sheets = google.sheets({ version: 'v4', auth: client });
  const drive = google.drive({ version: 'v3', auth: client });

  try {
    const search = await drive.files.list({
      q: "name = 'Raphael Goal Tracker' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      fields: 'files(id)',
      pageSize: 1
    });

    const spreadsheetId = search.data.files?.[0]?.id;
    if (!spreadsheetId) return res.status(404).json({ error: "Spreadsheet not found" });

    // Fetch Goals, Logs and Journal
    const goalsRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Goals!A:D' });
    const logsRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Logs!A:H' });
    const journalRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Journal!A:B' });

    res.json({
      success: true,
      goals: goalsRes.data.values || [],
      logs: logsRes.data.values || [],
      journal: journalRes.data.values || []
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- DELETE SPREADSHEET ---
api.post(["/sheets/delete", "/sheets/delete/"], async (req, res) => {
  const { tokens } = req.body;
  if (!tokens) return res.status(401).json({ error: "No tokens provided" });

  addLog(`[DELETE] Initializing Google clients...`);
  const client = getOAuthClient(req);
  client.setCredentials(tokens);
  const drive = google.drive({ version: 'v3', auth: client });

  try {
    addLog(`[DELETE] Searching for spreadsheet to delete...`);
    const search = await drive.files.list({
      q: "name = 'Raphael Goal Tracker' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      fields: 'files(id)',
      pageSize: 1
    });

    const spreadsheetId = search.data.files?.[0]?.id;
    if (spreadsheetId) {
      addLog(`[DELETE] Deleting spreadsheet: ${spreadsheetId}`);
      await drive.files.delete({ fileId: spreadsheetId });
      addLog(`[DELETE] Spreadsheet deleted successfully`);
      res.json({ success: true, message: "Spreadsheet deleted from Google Drive" });
    } else {
      addLog(`[DELETE] No spreadsheet found to delete`);
      res.json({ success: true, message: "No spreadsheet found to delete" });
    }
  } catch (error: any) {
    addLog(`[DELETE] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// --- CLEAR SPREADSHEET DATA ---
api.post(["/sheets/clear", "/sheets/clear/"], async (req, res) => {
  const { tokens } = req.body;
  if (!tokens) return res.status(401).json({ error: "No tokens provided" });

  addLog(`[CLEAR] Initializing Google clients...`);
  const client = getOAuthClient(req);
  client.setCredentials(tokens);
  const sheets = google.sheets({ version: 'v4', auth: client });
  const drive = google.drive({ version: 'v3', auth: client });

  try {
    addLog(`[CLEAR] Searching for spreadsheet to clear...`);
    const search = await drive.files.list({
      q: "name = 'Raphael Goal Tracker' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      fields: 'files(id)',
      pageSize: 1
    });

    const spreadsheetId = search.data.files?.[0]?.id;
    if (spreadsheetId) {
      addLog(`[CLEAR] Clearing spreadsheet data: ${spreadsheetId}`);
      
      // Clear Goals, Logs, and Journal sheets
      const sheetsToClear = ['Goals', 'Logs', 'Journal'];
      const ssData = await sheets.spreadsheets.get({ spreadsheetId });
      const existingSheets = ssData.data.sheets?.map(s => s.properties?.title) || [];
      
      const rangesToClear = sheetsToClear
        .filter(name => existingSheets.includes(name))
        .map(name => `${name}!A1:Z1000`);

      if (rangesToClear.length > 0) {
        await sheets.spreadsheets.values.batchClear({
          spreadsheetId,
          requestBody: { ranges: rangesToClear }
        });
        addLog(`[CLEAR] Data cleared successfully from sheets: ${rangesToClear.join(', ')}`);
      }
      
      res.json({ success: true, message: "Spreadsheet data cleared successfully" });
    } else {
      addLog(`[CLEAR] No spreadsheet found to clear`);
      res.json({ success: true, message: "No spreadsheet found to clear" });
    }
  } catch (error: any) {
    addLog(`[CLEAR] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.use("/api", api);

// 3.5 OAUTH CALLBACK (Separate from API router to handle redirect correctly)
app.get(["/auth/google/callback", "/auth/google/callback/"], async (req, res) => {
  const { code } = req.query;
  console.log(`[AUTH] Callback received. Code present: ${!!code}`);
  
  if (!code) {
    return res.status(400).send("No authorization code received from Google.");
  }

  try {
    const client = getOAuthClient(req);
    const { tokens } = await client.getToken(code as string);
    console.log("[AUTH] Tokens exchanged successfully");
    
    res.send(`
      <html>
        <head>
          <title>Authentication Successful</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f0; color: #1a1a1a;">
          <div style="text-align: center; padding: 2.5rem; background: white; border-radius: 2rem; box-shadow: 0 20px 40px rgba(0,0,0,0.08); max-width: 90%; width: 400px;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">✅</div>
            <h1 style="margin: 0 0 0.5rem 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; text-transform: uppercase;">Connected!</h1>
            <p style="color: #666; font-size: 0.9rem; line-height: 1.5; margin-bottom: 2rem;">Your Google account is now linked to Raphael Goal Tracker.</p>
            <div id="status" style="font-size: 0.8rem; font-weight: 600; color: #5A5A40; text-transform: uppercase; letter-spacing: 0.05em;">Finalizing...</div>
            
            <script>
              const tokens = ${JSON.stringify(tokens)};
              const statusEl = document.getElementById('status');
              
              try {
                // Try to notify the opener window (popup flow)
                if (window.opener) {
                  console.log("Notifying opener window...");
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', tokens: tokens }, '*');
                  statusEl.innerText = "Closing window...";
                  setTimeout(() => window.close(), 1000);
                } else {
                  // Fallback for redirect flow (mobile)
                  console.log("No opener found, using localStorage fallback...");
                  localStorage.setItem('google_tokens', JSON.stringify(tokens));
                  statusEl.innerText = "Redirecting back to app...";
                  setTimeout(() => {
                    window.location.href = '/';
                  }, 1200);
                }
              } catch (e) {
                console.error("Error in callback script:", e);
                statusEl.innerText = "Error: " + e.message;
                // Even if postMessage fails, try redirecting as a last resort
                localStorage.setItem('google_tokens', JSON.stringify(tokens));
                setTimeout(() => { window.location.href = '/'; }, 2000);
              }
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("[AUTH] Callback Error:", error);
    res.status(500).send("Authentication failed: " + error.message + ". Please try again.");
  }
});

// 3.6 API CATCH-ALL
app.use("/api/*", (req, res) => {
  const logMsg = `[API 404] ${req.method} ${req.originalUrl} - Not matched by apiRouter. BaseUrl: ${req.baseUrl}, Path: ${req.path}`;
  addLog(logMsg);
  console.log(logMsg);
  res.status(404).json({ 
    error: "API endpoint not found", 
    method: req.method, 
    path: req.originalUrl,
    baseUrl: req.baseUrl,
    reqPath: req.path
  });
});

// 4. FRONTEND SERVING
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    const indexPath = path.join(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Build not found. Please wait...");
    }
  });
} else {
  console.log("Starting Vite in middleware mode...");
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.listen(PORT, "0.0.0.0", () => {
  addStartupLog(`!!! CUSTOM SERVER RUNNING ON PORT ${PORT} !!!`);
});
