/* =====================================================================
   TechBridge Task Management: BACKEND  (Task 7)
   Node.js + Express

   What this file does:
     1. Starts a web server on http://localhost:3000
     2. Loads the 8 tasks from data/tasks.json
     3. Offers an API the dashboard can talk to:
          GET  /api/health      is the server alive?
          GET  /api/tasks       give me all tasks
          GET  /api/tasks/:id   give me ONE task
          PUT  /api/tasks/:id   change a task's status
          POST /api/reset       put the demo progress back to the start
     4. Also serves the frontend folder, so you can open the dashboard at
        http://localhost:3000/dashboard.html
   ===================================================================== */

const express = require("express");   // the Express library (installed with npm)
const fs = require("fs");               // built into Node: read and write files
const path = require("path");           // built into Node: build safe file paths

const app = express();                  // "app" is our server
const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, "data", "tasks.json");
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

const VALID_STATUSES = ["completed", "in-progress", "not-started"];
const DEFAULT_COMPLETED = [1, 2, 3, 4, 5];   // the demo starts with Tasks 1 to 5 done

// Pretend the network is a little slow (in milliseconds) so you can SEE the
// loading state while learning. Set it to 0 when you are finished testing.
const FAKE_DELAY_MS = 0;


/* ---------------------------------------------------------------------
   1. THE DATA
   We read tasks.json once, when the server starts, and keep the tasks
   in a variable called "tasks". Every request reads or changes this list.
   When something changes we also save it back to the file, so progress
   is still there after you restart the server.
--------------------------------------------------------------------- */
let tasks = [];

try {
  tasks = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch (error) {
  console.error("Could not read data/tasks.json:", error.message);
  process.exit(1);   // no data, no point running
}

function saveTasks() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2) + "\n");
  } catch (error) {
    console.error("Could not save tasks.json:", error.message);
  }
}

// Rule: the FIRST task that is not completed is "in-progress",
// every later one is "not-started". The server keeps this rule true.
function fixStatuses() {
  let currentFound = false;
  tasks.forEach(function (task) {
    if (task.status === "completed") { return; }
    if (!currentFound) {
      task.status = "in-progress";
      currentFound = true;
    } else {
      task.status = "not-started";
    }
  });
}

fixStatuses();


/* ---------------------------------------------------------------------
   2. MIDDLEWARE
   Middleware = a helper that every request passes through BEFORE it
   reaches your route. Think of security guards at a building entrance.
--------------------------------------------------------------------- */

// (a) Read JSON sent by the frontend (needed for PUT bodies).
app.use(express.json());

// (b) CORS: lets the dashboard talk to this server even when the page was
//     opened from another address (for example VS Code Live Server on
//     port 5500). Without this, the browser blocks those requests.
app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { return res.sendStatus(204); }  // browser's "may I?" check
  next();
});

// (c) Show every request in the terminal. Great for learning.
app.use(function (req, res, next) {
  console.log(req.method + " " + req.url);
  next();
});

// (d) Serve the website files (HTML, CSS, JS, images).
app.use(express.static(FRONTEND_DIR));


/* ---------------------------------------------------------------------
   3. THE API ENDPOINTS (routes)
   A route says: "when a request of THIS method arrives at THIS address,
   run THIS function." req = the request, res = our reply.
--------------------------------------------------------------------- */

// Health check: the dashboard asks this every few seconds
// to show "Backend Status: Connected / Offline". No delay on this one.
app.get("/api/health", function (req, res) {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Slow everything below down a little (see FAKE_DELAY_MS above).
app.use("/api", function (req, res, next) {
  setTimeout(next, FAKE_DELAY_MS);
});

// GET /api/tasks  ->  all tasks
app.get("/api/tasks", function (req, res) {
  res.json(tasks);
});

// GET /api/tasks/3  ->  just Task 3
// ":id" is a placeholder. Whatever the visitor types there arrives in req.params.id
app.get("/api/tasks/:id", function (req, res) {
  const id = Number(req.params.id);
  const task = tasks.find(function (t) { return t.id === id; });

  if (!task) {
    return res.status(404).json({ error: "Task " + req.params.id + " was not found." });
  }
  res.json(task);
});

// PUT /api/tasks/3  with body { "status": "completed" }  ->  update Task 3
app.put("/api/tasks/:id", function (req, res) {
  const id = Number(req.params.id);
  const task = tasks.find(function (t) { return t.id === id; });
  const newStatus = req.body && req.body.status;

  if (!task) {
    return res.status(404).json({ error: "Task " + req.params.id + " was not found." });
  }
  if (!VALID_STATUSES.includes(newStatus)) {
    return res.status(400).json({ error: "Status must be one of: " + VALID_STATUSES.join(", ") + "." });
  }

  task.status = newStatus;
  fixStatuses();      // keep "in-progress" on the right task
  saveTasks();
  res.json(task);     // reply with the updated task
});

// POST /api/reset  ->  back to the demo state (used by "Reset demo progress")
app.post("/api/reset", function (req, res) {
  tasks.forEach(function (task) {
    task.status = DEFAULT_COMPLETED.includes(task.id) ? "completed" : "not-started";
  });
  fixStatuses();
  saveTasks();
  res.json(tasks);
});

// Any other /api address does not exist: say so in JSON, not in HTML.
app.use("/api", function (req, res) {
  res.status(404).json({ error: "That API endpoint does not exist." });
});


/* ---------------------------------------------------------------------
   4. START THE SERVER
--------------------------------------------------------------------- */
app.listen(PORT, function () {
  console.log("");
  console.log("TechBridge backend is running.");
  console.log("  Dashboard:  http://localhost:" + PORT + "/dashboard.html");
  console.log("  API:        http://localhost:" + PORT + "/api/tasks");
  console.log("Press Ctrl + C to stop the server.");
  console.log("");
});
