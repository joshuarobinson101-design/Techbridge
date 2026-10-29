/* =====================================================================
   TechBridge Intern Dashboard  (Task 7: connected to a backend API)
   What changed since Task 6:
     BEFORE: the 8 tasks were typed into this file and progress was kept
             in Local Storage (inside one browser).
     NOW:    the tasks live on the SERVER (backend/data/tasks.json).
             This file ASKS the server for them using fetch(), and
             TELLS the server when a task changes.

   What this file does:
     1. Talks to the API (fetch) and shows loading / error states
     2. Shows whether the backend is Connected or Offline
     3. Builds the task cards from the data the API sends back
     4. Marks tasks completed (PUT request) and updates the progress
     5. Filters tasks and opens a details pop-up (GET one task)
     6. Runs the Technology Explorer (Next.js, Vue, Angular, Backend)
   Nothing here reloads the page.
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. SETTINGS AND STATE
--------------------------------------------------------------------- */

// Where is the API?
//  - If this page was opened FROM the Express server (port 3000), a short
//    address like "/api" is enough.
//  - If it was opened some other way (Live Server, double-click), we use
//    the full address of the backend instead.
// Paste YOUR Render link here. Keep "/api" at the end, with no slash after it.
const LIVE_API = "https://techbridge-i5aw.onrender.com/api";

const onThisComputer = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = onThisComputer
  ? (location.port === "3000" ? "/api" : "http://localhost:3000/api")   // testing on your laptop
  : LIVE_API;                                                           // on GitHub Pages

// A free Render server can take up to a minute to wake up, so wait longer.
const REQUEST_TIMEOUT = 60000;
const HEALTH_CHECK_EVERY = 5000;    // ask "are you alive?" every 5 seconds

const challengeCount = 10;          // how many challenges the Challenge Hub has

const intern = {
  name: "Joshua",
  role: "Web Development Intern"
};

// STATE: the few values that change while the page is open.
let tasks = [];             // starts EMPTY. The API fills it.
let totalTasks = 8;         // updated from the real list once it arrives
let loadState = "loading";  // "loading" | "ready" | "error"
let backendOnline = null;   // null = not checked yet, true = connected, false = offline
let currentFilter = "all";
let lastCompleted = null;   // the task just completed (used for a short highlight)
let shownPercent = 0;       // the number currently shown (used for the count-up effect)
let toastTimer = null;
let slowTimer = null;

// Words shown for each status, and a small symbol so colour is never the only clue.
const statusLabels = { "completed": "Completed", "in-progress": "In Progress", "not-started": "Not Started" };
const statusIcons  = { "completed": "✓", "in-progress": "●", "not-started": "○" };

// Difficulty text -> number 1 to 3 (used by the little bars).
const levelNumbers = { "Beginner": 1, "Beginner → Intermediate": 2, "Intermediate": 3 };


/* ---------------------------------------------------------------------
   2. PARTS OF THE PAGE WE NEED TO CHANGE
--------------------------------------------------------------------- */
const el = {
  name:        document.getElementById("intern-name"),
  role:        document.getElementById("intern-role"),
  message:     document.getElementById("welcome-message"),
  status:      document.getElementById("intern-status"),
  currentLine: document.getElementById("current-task-line"),
  continueBtn: document.getElementById("continue-btn"),
  apiStatus:     document.getElementById("api-status"),
  apiStatusText: document.getElementById("api-status-text"),

  progressCard: document.querySelector(".progress-card"),
  pctBig:      document.getElementById("pct-big"),
  summary:     document.getElementById("progress-summary"),
  bar:         document.getElementById("bar"),
  barFill:     document.getElementById("bar-fill"),
  statTotal:   document.getElementById("stat-total"),
  statDone:    document.getElementById("stat-done"),
  statLeft:    document.getElementById("stat-left"),
  statPct:     document.getElementById("stat-pct"),
  celebrate:   document.getElementById("celebrate"),

  grid:        document.getElementById("task-grid"),
  count:       document.getElementById("task-count"),
  empty:       document.getElementById("task-empty"),
  taskError:   document.getElementById("task-error"),
  retryBtn:    document.getElementById("retry-btn"),
  filterBtns:  document.querySelectorAll("[data-filter]"),
  resetBtn:    document.getElementById("reset-progress"),

  challengeCount: document.getElementById("challenge-count"),

  modal:       document.getElementById("task-modal"),
  modalBody:   document.getElementById("task-modal-body"),
  toast:       document.getElementById("toast"),

  techButtons: document.querySelectorAll("[data-tech]"),
  techPanel:   document.getElementById("tech-panel")
};


/* ---------------------------------------------------------------------
   3. TALKING TO THE API
   apiRequest() is the ONE place that sends requests. Every other
   function calls it, so the fetch details are written only once.

   "async / await" means: start the request, WAIT for the answer without
   freezing the page, then carry on with the next line.
--------------------------------------------------------------------- */
async function apiRequest(path, options) {
  // AbortController lets us cancel a request that takes too long.
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT);

  try {
    const response = await fetch(API_BASE + path, Object.assign({ signal: controller.signal }, options));

    let body = null;
    try { body = await response.json(); } catch (error) { /* the reply had no JSON */ }

    // fetch() only throws when the server cannot be REACHED.
    // A 404 or 400 still "arrives", so we check response.ok ourselves.
    if (!response.ok) {
      throw new Error((body && body.error) || "The server replied with an error (" + response.status + ").");
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

// The API calls each task's number "id". The Task 6 code used "number",
// so we add "number" to every task as it arrives. Nothing else had to change.
function fromApi(task) {
  return Object.assign({}, task, { number: task.id });
}

// Turn a technical error into a sentence a person can understand.
function friendlyError(error) {
  if (error instanceof TypeError || error.name === "AbortError") {
    return "Could not reach the backend. Is the server running?";
  }
  return error.message;
}

// Ask the server for ALL tasks. Shows the loading state first, and the
// error state if it fails.
async function loadTasks() {
  loadState = "loading";
  showLoading();

  try {
    const data = await apiRequest("/tasks");           // GET /api/tasks
    tasks = data.map(fromApi);
    totalTasks = tasks.length;
    loadState = "ready";
    setBackendStatus(true);
    renderAll();
  } catch (error) {
    loadState = "error";
    setBackendStatus(false);
    showError();
  }
}

// Same request, but quiet: no loading screen. Used after a change, so the
// screen always matches what the SERVER says.
async function refreshTasks() {
  const data = await apiRequest("/tasks");
  tasks = data.map(fromApi);
  totalTasks = tasks.length;
  renderAll();
}


/* ---------------------------------------------------------------------
   4. BACKEND STATUS INDICATOR
   Every few seconds we ping /api/health. If it answers, we show
   "Connected". If not, "Offline". If the backend comes back, the
   dashboard recovers by itself.
--------------------------------------------------------------------- */
function setBackendStatus(online) {
  backendOnline = online;
  el.apiStatus.classList.remove("is-checking", "is-online", "is-offline");
  el.apiStatus.classList.add(online ? "is-online" : "is-offline");
  el.apiStatusText.textContent = online ? "Connected" : "Offline";
}

async function checkBackend() {
  const wasOnline = backendOnline;
  try {
    await apiRequest("/health");
    setBackendStatus(true);
    if (loadState === "error") {
      loadTasks();                                       // we were stuck on the error screen: try again
    } else if (wasOnline === false) {
      refreshTasks().catch(function () {});              // it was away and came back: refresh quietly
      showToast("Backend is back online.");
    }
  } catch (error) {
    setBackendStatus(false);
  }
}


/* ---------------------------------------------------------------------
   5. LOADING AND ERROR STATES
   LOADING: grey "skeleton" cards that shimmer where the real cards will
            appear, so the page never looks empty or jumps around.
   ERROR:   a friendly message, a hint about what to do, and a Try again
            button. The dashboard also retries by itself when the
            backend comes back (see checkBackend above).
--------------------------------------------------------------------- */
function buildSkeleton() {
  const card = '<li class="d-card skeleton" aria-hidden="true">' +
    '<span class="sk sk-short"></span><span class="sk sk-title"></span>' +
    '<span class="sk sk-line"></span><span class="sk sk-line sk-mid"></span>' +
    '<span class="sk sk-btns"></span></li>';
  return card.repeat(6);
}

function showLoading() {
  clearTimeout(slowTimer);
  el.taskError.hidden = true;
  el.progressCard.classList.remove("is-error");
  el.progressCard.classList.add("is-loading");

  el.message.textContent = "Getting your tasks from the TechBridge backend…";
  el.status.textContent = "Loading…";
  el.status.className = "status-badge st-not-started";
  el.currentLine.innerHTML = '<span class="status-line-label">Current task</span> Loading…';
  el.continueBtn.hidden = true;

  el.pctBig.textContent = "–";
  el.summary.textContent = "Loading your progress…";
  [el.statTotal, el.statDone, el.statLeft, el.statPct].forEach(function (node) { node.textContent = "–"; });
  el.barFill.style.width = "0%";
  el.celebrate.hidden = true;
  shownPercent = 0;

  el.filterBtns.forEach(function (button) { button.querySelector(".f-count").textContent = ""; });
  el.count.innerHTML = '<span class="spinner" aria-hidden="true"></span> Loading tasks…';
  el.empty.hidden = true;
  el.grid.hidden = false;
  el.grid.classList.remove("animate");
  el.grid.setAttribute("aria-busy", "true");
  el.grid.innerHTML = buildSkeleton();

  // If the server is slow, say so instead of leaving people guessing.
  slowTimer = setTimeout(function () {
    el.count.innerHTML = '<span class="spinner" aria-hidden="true"></span> Still working… the server is taking longer than usual.';
  }, 3000);
}

function showError() {
  clearTimeout(slowTimer);
  el.progressCard.classList.remove("is-loading");
  el.progressCard.classList.add("is-error");

  el.message.textContent = "We could not reach the TechBridge backend.";
  el.status.textContent = "Unavailable";
  el.status.className = "status-badge st-not-started";
  el.currentLine.innerHTML = '<span class="status-line-label">Current task</span> Unavailable while offline';
  el.continueBtn.hidden = true;

  el.pctBig.textContent = "–";
  el.summary.textContent = "Progress is unavailable while the backend is offline.";
  [el.statTotal, el.statDone, el.statLeft, el.statPct].forEach(function (node) { node.textContent = "–"; });
  el.barFill.style.width = "0%";
  el.celebrate.hidden = true;

  el.count.textContent = "";
  el.grid.removeAttribute("aria-busy");
  el.grid.innerHTML = "";
  el.grid.hidden = true;
  el.empty.hidden = true;
  el.taskError.hidden = false;
}


/* ---------------------------------------------------------------------
   6. CONDITIONAL LOGIC AND PROGRESS MATH
   (The server now decides each task's status, so updateStatuses() from
   Task 6 is gone. These functions only READ the data.)
--------------------------------------------------------------------- */
function countCompleted() {
  return tasks.filter(function (task) { return task.status === "completed"; }).length;
}

function getCurrentTask() {
  return tasks.find(function (task) { return task.status === "in-progress"; }) || null;
}

// 3 of 8 -> 37.5   |   4 of 8 -> 50   |   (toFixed(1) keeps one decimal, Number() drops a useless ".0")
function getPercent(done) {
  return Number(((done / totalTasks) * 100).toFixed(1));
}

function getOverallStatus(done) {
  if (done === 0) { return "Not Started"; }
  if (done === totalTasks) { return "Completed"; }
  return "In Progress";
}

function getWelcomeMessage(done) {
  if (done === 0) { return "Your internship starts here. Open Task 1 when you are ready."; }
  if (done === totalTasks) { return "You finished every task. Look at how far you have come."; }
  if (done < totalTasks / 2) { return "Good start. Keep the momentum going, one task at a time."; }
  return "You are past the halfway mark. Keep going, the finish line is in sight.";
}

function levelOf(difficulty) {
  return levelNumbers[difficulty] || 1;
}

// Three small bars showing difficulty (same idea as the Challenge Hub).
function buildMeter(difficulty) {
  const level = levelOf(difficulty);
  let bars = "";
  for (let i = 1; i <= 3; i++) {
    bars += i <= level ? '<i class="on"></i>' : "<i></i>";
  }
  return '<span class="meter" aria-hidden="true">' + bars + "</span>";
}


/* ---------------------------------------------------------------------
   7. DRAWING THE PAGE
   Each render function reads the current data and updates one area.
--------------------------------------------------------------------- */
function renderWelcome(done) {
  const current = getCurrentTask();
  const overall = getOverallStatus(done);

  el.name.textContent = intern.name;
  el.role.textContent = intern.role;
  el.message.textContent = getWelcomeMessage(done);

  el.status.textContent = overall;
  el.status.className = "status-badge " + (overall === "Completed" ? "st-completed" : overall === "Not Started" ? "st-not-started" : "st-in-progress");

  if (current) {
    el.currentLine.innerHTML = '<span class="status-line-label">Current task</span> Task ' + current.number + ": " + current.title;
    el.continueBtn.textContent = "Continue Task " + current.number;
    el.continueBtn.dataset.view = current.number;
    el.continueBtn.hidden = false;
  } else {
    el.currentLine.innerHTML = '<span class="status-line-label">Current task</span> None. Everything is done.';
    el.continueBtn.hidden = true;
  }
}

// The big percentage counts up (or down) to its new value instead of jumping.
function animatePercent(target) {
  const from = shownPercent;
  shownPercent = target;

  if (from === target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.pctBig.textContent = target;
    return;
  }
  const start = performance.now();
  const duration = 700;

  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    el.pctBig.textContent = Number((from + (target - from) * t).toFixed(1));
    if (t < 1 && shownPercent === target) { requestAnimationFrame(step); }
    else { el.pctBig.textContent = shownPercent; }
  }
  requestAnimationFrame(step);
}

function renderProgress(done) {
  const remaining = totalTasks - done;
  const percent = getPercent(done);

  el.summary.textContent = done + " / " + totalTasks + " Tasks Completed, " + remaining + (remaining === 1 ? " Task Remaining" : " Tasks Remaining");
  animatePercent(percent);
  el.statTotal.textContent = totalTasks;
  el.statDone.textContent = done;
  el.statLeft.textContent = remaining;
  el.statPct.textContent = percent + "%";

  // The bar is as wide as the percentage. CSS animates the change.
  el.barFill.style.width = percent + "%";
  el.bar.setAttribute("aria-valuenow", percent);
  el.bar.setAttribute("aria-valuetext", done + " of " + totalTasks + " tasks completed");

  el.celebrate.hidden = done !== totalTasks;
  document.body.classList.toggle("all-done", done === totalTasks);
}

function renderFilterCounts() {
  el.filterBtns.forEach(function (button) {
    const wanted = button.dataset.filter;
    const n = wanted === "all"
      ? tasks.length
      : tasks.filter(function (task) { return task.status === wanted; }).length;
    button.querySelector(".f-count").textContent = n;
  });
}

function buildTaskCard(task, index) {
  const justDone = task.number === lastCompleted ? ' data-just="true"' : "";

  // Finished tasks get an Undo button. Others get Mark as Completed.
  const actionButton = task.status === "completed"
    ? '<button type="button" class="btn-undo" data-undo="' + task.number + '">Undo</button>'
    : '<button type="button" class="btn-complete" data-complete="' + task.number + '">Mark as Completed</button>';

  return `
    <li class="d-card" data-status="${task.status}"${justDone} style="--i:${index}">
      <div class="d-top">
        <span class="d-num">Task ${task.number}</span>
        <span class="status-badge st-${task.status}"><span aria-hidden="true">${statusIcons[task.status]}</span> ${statusLabels[task.status]}</span>
      </div>
      <h3>${task.title}</h3>
      <p class="d-desc">${task.description}</p>
      <p class="d-meta">
        <span>Opens Day ${task.day}</span>
        <span class="c-level diff-${levelOf(task.difficulty)}">${buildMeter(task.difficulty)}${task.difficulty}</span>
      </p>
      <div class="d-actions">
        <button type="button" class="btn-view-task" data-view="${task.number}">View Task</button>
        ${actionButton}
      </div>
    </li>`;
}

// animate = true only when the visitor changes the filter, so cards
// do not all flash again every time one task is completed.
function renderTasks(animate) {
  const list = tasks.filter(function (task) {
    return currentFilter === "all" || task.status === currentFilter;
  });

  el.grid.removeAttribute("aria-busy");
  el.grid.classList.toggle("animate", animate);
  el.grid.innerHTML = list.map(buildTaskCard).join("");

  el.count.textContent = "Showing " + list.length + " of " + tasks.length + " tasks";
  el.grid.hidden = list.length === 0;
  el.empty.hidden = list.length !== 0;
}

// One function to refresh everything that depends on the data.
function renderAll(animateGrid) {
  clearTimeout(slowTimer);
  el.progressCard.classList.remove("is-loading", "is-error");
  el.taskError.hidden = true;

  const done = countCompleted();
  renderWelcome(done);
  renderProgress(done);
  renderFilterCounts();
  renderTasks(animateGrid === true);
}


/* ---------------------------------------------------------------------
   8. CHANGING PROGRESS (sends requests to the backend)
   The flow when you press "Mark as Completed":
     1. The button says "Saving…"
     2. JavaScript sends   PUT /api/tasks/3   { "status": "completed" }
     3. The server updates the task and replies
     4. We ask for the fresh list (GET /api/tasks)
     5. The cards and the progress numbers redraw
--------------------------------------------------------------------- */
function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.toast.classList.remove("show"); }, 4000);
}

function progressText(done) {
  return done + " / " + totalTasks + " (" + getPercent(done) + "%)";
}

// Returns true if the change was saved, false if it failed.
async function changeStatus(number, newStatus, button) {
  const before = countCompleted();

  if (button) {
    button.disabled = true;
    button.textContent = "Saving…";
  }

  try {
    await apiRequest("/tasks/" + number, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });
    lastCompleted = newStatus === "completed" ? number : null;
    await refreshTasks();
    setBackendStatus(true);

    const after = countCompleted();
    if (newStatus === "completed" && after === totalTasks) {
      showToast("All " + totalTasks + " tasks completed. Congratulations!");
    } else if (newStatus === "completed") {
      showToast("Task " + number + " completed. " + progressText(before) + " → " + progressText(after));
    } else {
      showToast("Task " + number + " moved back to your to-do list. " + progressText(before) + " → " + progressText(after));
    }
    return true;
  } catch (error) {
    if (error instanceof TypeError || error.name === "AbortError") { setBackendStatus(false); }
    showToast("Could not save the change. " + friendlyError(error));
    if (loadState === "ready") { renderTasks(false); }   // put the button back to normal
    return false;
  }
}

function completeTask(number, button) { return changeStatus(number, "completed", button); }
function undoTask(number, button)     { return changeStatus(number, "not-started", button); }

async function resetProgress() {
  el.resetBtn.disabled = true;
  try {
    await apiRequest("/reset", { method: "POST" });    // POST /api/reset
    lastCompleted = null;
    await refreshTasks();
    showToast("Progress reset to the demo state.");
  } catch (error) {
    showToast("Could not reset. " + friendlyError(error));
  } finally {
    el.resetBtn.disabled = false;
  }
}


/* ---------------------------------------------------------------------
   9. THE TASK DETAILS POP-UP
   When you press View Task, we ask the API for THAT ONE task:
       GET /api/tasks/3
   The pop-up opens straight away with a spinner, then fills in when the
   answer arrives. If the request fails, the pop-up shows a message.
--------------------------------------------------------------------- */
function showInModal(html) {
  el.modalBody.innerHTML = html;
  document.body.classList.add("modal-open");
  if (!el.modal.open) {                       // calling showModal() twice would cause an error
    if (typeof el.modal.showModal === "function") {
      el.modal.showModal();
    } else {
      el.modal.setAttribute("open", "");
    }
  }
  el.modal.scrollTop = 0;
}

async function openTask(number) {
  // Only show the spinner when the pop-up is not already open
  // (after "Mark as Completed" we just swap the content quietly).
  if (!el.modal.open) {
    showInModal(`
      <div class="modal-state">
        <button type="button" class="modal-x modal-x-dark" data-close aria-label="Close">&times;</button>
        <span class="spinner spinner-big" aria-hidden="true"></span>
        <h3 id="task-modal-title">Loading task…</h3>
        <p>Fetching the details from the backend.</p>
      </div>`);
  }

  try {
    const task = fromApi(await apiRequest("/tasks/" + number));   // GET /api/tasks/3
    showInModal(buildTaskModal(task));
  } catch (error) {
    showInModal(`
      <div class="modal-state">
        <button type="button" class="modal-x modal-x-dark" data-close aria-label="Close">&times;</button>
        <h3 id="task-modal-title">Unable to load this task.</h3>
        <p>${friendlyError(error)}</p>
        <button type="button" class="btn-close" data-close>Close</button>
      </div>`);
  }
}

function buildTaskModal(task) {
  const listItems = function (items) {
    return items.map(function (item) { return "<li>" + item + "</li>"; }).join("");
  };

  const toggleButton = task.status === "completed"
    ? '<button type="button" class="btn-undo btn-undo-modal" data-undo="' + task.number + '">Undo completion</button>'
    : '<button type="button" class="btn btn-primary btn-modal-complete" data-complete="' + task.number + '">Mark as Completed</button>';

  let pageLink = "";
  if (task.page && task.page !== "dashboard.html") {
    pageLink = '<a class="btn-link" href="' + task.page + '">' + task.pageLabel + "</a>";
  } else if (task.page === "dashboard.html") {
    pageLink = '<span class="here-note">You are on this page right now</span>';
  }

  return `
    <div class="modal-head st-${task.status}">
      <button type="button" class="modal-x" data-close aria-label="Close task details">&times;</button>
      <div class="c-top">
        <span class="d-num d-num-light">Task ${task.number}</span>
        <span class="c-time">Opens on Day ${task.day}</span>
      </div>
      <h3 id="task-modal-title">${task.title}</h3>
      <p class="modal-status">
        <span class="status-badge st-${task.status}"><span aria-hidden="true">${statusIcons[task.status]}</span> ${statusLabels[task.status]}</span>
        <span class="c-level diff-${levelOf(task.difficulty)}">${buildMeter(task.difficulty)}${task.difficulty}</span>
      </p>
    </div>

    <div class="modal-content">
      <h4>About this task</h4>
      <p>${task.description}</p>

      <h4>What you will build</h4>
      <ul class="produce-list">${listItems(task.build)}</ul>

      <h4>Skills practised</h4>
      <ul class="tag-list">${listItems(task.skills)}</ul>

      <div class="modal-actions">
        ${toggleButton}
        ${pageLink}
        <button type="button" class="btn-close" data-close>Close</button>
      </div>
    </div>`;
}

function closeModal() {
  if (typeof el.modal.close === "function") { el.modal.close(); } else { el.modal.removeAttribute("open"); }
  document.body.classList.remove("modal-open");
}


/* ---------------------------------------------------------------------
   10. EVENT LISTENERS
   EVENT DELEGATION: the cards are rebuilt every time, so instead of
   attaching a listener to every button we listen ONCE on the parent
   and use closest() to see which button was clicked.
--------------------------------------------------------------------- */

// Buttons inside the task grid: View, Complete, Undo
el.grid.addEventListener("click", async function (event) {
  const viewBtn     = event.target.closest("[data-view]");
  const completeBtn = event.target.closest("[data-complete]");
  const undoBtn     = event.target.closest("[data-undo]");

  if (viewBtn) {
    openTask(Number(viewBtn.dataset.view));
  } else if (completeBtn) {
    const n = Number(completeBtn.dataset.complete);
    await completeTask(n, completeBtn);
    focusCard(n);
  } else if (undoBtn) {
    const n = Number(undoBtn.dataset.undo);
    await undoTask(n, undoBtn);
    focusCard(n);
  }
});

// The cards were rebuilt, so the button that had keyboard focus is gone.
// Put focus back on that card's View Task button so keyboard users do not lose their place.
function focusCard(number) {
  const button = el.grid.querySelector('[data-view="' + number + '"]');
  if (button) { button.focus(); }
}

// "Continue Task" button in the welcome area
el.continueBtn.addEventListener("click", function () {
  openTask(Number(el.continueBtn.dataset.view));
});

// "Try again" button on the error panel
el.retryBtn.addEventListener("click", loadTasks);

// Buttons inside the pop-up
el.modal.addEventListener("click", async function (event) {
  if (event.target.closest("[data-close]") || event.target === el.modal) {
    closeModal();
    return;
  }
  const completeBtn = event.target.closest("[data-complete]");
  const undoBtn     = event.target.closest("[data-undo]");
  if (completeBtn) {
    const n = Number(completeBtn.dataset.complete);
    if (await completeTask(n, completeBtn)) {
      await openTask(n);                           // redraw the pop-up with the new status
      const again = el.modalBody.querySelector("[data-undo]");
      if (again) { again.focus(); }
    } else {
      completeBtn.disabled = false;
      completeBtn.textContent = "Mark as Completed";
    }
  } else if (undoBtn) {
    const n = Number(undoBtn.dataset.undo);
    if (await undoTask(n, undoBtn)) {
      await openTask(n);
      const again = el.modalBody.querySelector("[data-complete]");
      if (again) { again.focus(); }
    } else {
      undoBtn.disabled = false;
      undoBtn.textContent = "Undo completion";
    }
  }
});
el.modal.addEventListener("close", function () {
  document.body.classList.remove("modal-open");
});

// Filter buttons: All / Completed / In Progress / Not Started
// The filter works on the tasks we already received from the API.
el.filterBtns.forEach(function (button) {
  button.addEventListener("click", function () {
    currentFilter = button.dataset.filter;
    el.filterBtns.forEach(function (b) {
      b.setAttribute("aria-pressed", b === button ? "true" : "false");
    });
    if (loadState === "ready") { renderTasks(true); }
  });
});

el.resetBtn.addEventListener("click", resetProgress);


/* ---------------------------------------------------------------------
   11. TECHNOLOGY EXPLORER
   Same pattern again: DATA (an object holding every technology) plus a
   function that draws one of them. Clicking a button just calls
   showTech("vue") and the panel is rebuilt with Vue's information.
--------------------------------------------------------------------- */
const techData = {
  nextjs: {
    name: "Next.js",
    category: "Frontend framework (built on React)",
    summary: "Next.js is a React framework used for building modern, fast and search-friendly web applications.",
    what: "To understand Next.js you first need React. React is a JavaScript library for building screens out of small reusable pieces called components. Next.js sits on top of React and adds everything a real website needs: many pages, fast loading, good Google visibility, and even a place to write server code.",
    uses: [
      "Marketing sites and blogs that need to show up well on Google",
      "Online shops and product pages",
      "Web apps with logins and dashboards",
      "Full-stack projects with the frontend and backend in one codebase"
    ],
    needs: "JavaScript (or TypeScript), then React",
    noteTitle: "New to React? Start here",
    note: "Think of a card on your Challenge Hub. In plain JavaScript you wrote a function that builds the card's HTML and re-drew the list yourself whenever the data changed. In React you write the card once as a component and describe how it should look for the current data. React then updates the screen for you. Next.js is React plus the extra tools to turn those components into a complete website.",
    link: "https://nextjs.org",
    linkLabel: "Learn more about Next.js"
  },
  vue: {
    name: "Vue.js",
    category: "Frontend framework",
    summary: "Vue.js is a friendly JavaScript framework used to build interactive user interfaces.",
    what: "Vue lets you describe what the page should show and keeps the screen in sync with your data. It is known for being one of the easiest frameworks to learn, because its templates look a lot like normal HTML. You can add it to one small part of a page, or build a whole app with it.",
    uses: [
      "Interactive pages and single-page applications",
      "Dashboards and admin panels",
      "Adding features to an existing website step by step",
      "Larger sites using Nuxt, which does for Vue what Next.js does for React"
    ],
    needs: "HTML, CSS and JavaScript",
    noteTitle: "Why people like it",
    note: "If you already know HTML, CSS and JavaScript, Vue feels like a natural next step. It is a good way to see how frameworks keep the page and the data in sync without you writing every DOM update by hand.",
    link: "https://vuejs.org",
    linkLabel: "Learn more about Vue.js"
  },
  angular: {
    name: "Angular",
    category: "Frontend framework (by Google)",
    summary: "Angular is a complete framework from Google for building large, structured web applications.",
    what: "Where React and Vue let you pick your own extra tools, Angular comes with almost everything included: page navigation, forms, communication with servers and a strict project structure. It is written in TypeScript, which is JavaScript with added type checking. That structure helps big teams keep large projects organised.",
    uses: [
      "Large business and enterprise applications",
      "Internal company tools and admin systems",
      "Big projects with many developers working together",
      "Apps that need a lot of forms and data handling"
    ],
    needs: "JavaScript, then TypeScript",
    noteTitle: "A fair warning",
    note: "Angular has more to learn up front than Vue, because there are more built-in rules and ideas. The payoff is consistency: two Angular projects tend to be organised the same way, so developers can move between them easily.",
    link: "https://angular.dev",
    linkLabel: "Learn more about Angular"
  },
  backend: {
    name: "Backend Development",
    category: "The server side",
    summary: "The backend is the part of a website that runs on a server, stores data and applies the rules, out of the visitor's sight.",
    what: "The frontend is everything you see and click in the browser: the HTML, CSS and JavaScript you have been writing. The backend is the code on a server behind it. It saves information in a database, checks who is logged in, and sends back the data the frontend asks for. The two talk to each other through requests and responses.",
    uses: [
      "Logging in, signing up and keeping accounts safe",
      "Saving data permanently, such as interns and submitted tasks",
      "Payments, emails and notifications",
      "Providing an API that the frontend can ask for data"
    ],
    needs: "A programming language such as JavaScript, Python, PHP or C#, plus databases",
    steps: [
      "The frontend sends a request, for example when Joshua presses Submit Task",
      "The backend receives it and checks that Joshua is logged in",
      "The backend reads or saves the information in a database",
      "It sends a response back, usually as JSON data",
      "The frontend uses that data to update the page"
    ],
    techs: [
      { name: "Node.js", lang: "JavaScript", text: "Lets you run JavaScript on a server, so you can use one language for frontend and backend." },
      { name: "Express.js", lang: "JavaScript", text: "A small framework on top of Node.js for creating routes and APIs quickly." },
      { name: "Django", lang: "Python", text: "A full-featured framework with built-in login, admin panel and database tools." },
      { name: "Flask", lang: "Python", text: "A lightweight Python framework. You add only the pieces you need." },
      { name: "Laravel", lang: "PHP", text: "A popular PHP framework with clean syntax and many built-in features." },
      { name: ".NET", lang: "C#", text: "Microsoft's platform for building reliable, large-scale business applications." }
    ],
    noteTitle: "How this connects to your dashboard",
    note: "Your dashboard now has a real backend: a Node.js and Express server that holds the tasks and answers requests like GET /api/tasks and PUT /api/tasks/3. The progress is saved on the server instead of in one browser, so it no longer depends on which device you open the page on. The next step up would be storing it in a database.",
    link: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Server-side",
    linkLabel: "Learn more about backend development"
  }
};

function buildTech(tech) {
  const uses = tech.uses.map(function (u) { return "<li>" + u + "</li>"; }).join("");

  // Only the Backend entry has these two extra parts.
  let steps = "";
  if (tech.steps) {
    steps = `
      <h4>How the frontend and backend connect</h4>
      <ol class="flow">${tech.steps.map(function (s) { return "<li>" + s + "</li>"; }).join("")}</ol>`;
  }
  let techs = "";
  if (tech.techs) {
    techs = `
      <h4>Popular backend technologies</h4>
      <ul class="backend-grid">${tech.techs.map(function (t) {
        return '<li><strong>' + t.name + '</strong><span class="lang">' + t.lang + '</span><p>' + t.text + '</p></li>';
      }).join("")}</ul>`;
  }

  return `
    <p class="tech-cat">${tech.category}</p>
    <h3>${tech.name}</h3>
    <p class="tech-summary">${tech.summary}</p>

    <div class="tech-cols">
      <div><h4>What it is</h4><p>${tech.what}</p></div>
      <div><h4>Commonly used for</h4><ul>${uses}</ul></div>
    </div>

    ${steps}
    ${techs}

    <p class="tech-needs"><strong>You will need:</strong> ${tech.needs}</p>
    <div class="tech-note"><strong>${tech.noteTitle}</strong><p>${tech.note}</p></div>
    <a class="btn btn-primary" href="${tech.link}" target="_blank" rel="noopener noreferrer">${tech.linkLabel}</a>`;
}

function showTech(key) {
  el.techPanel.innerHTML = buildTech(techData[key]);
  el.techButtons.forEach(function (button) {
    button.setAttribute("aria-pressed", button.dataset.tech === key ? "true" : "false");
  });
}

el.techButtons.forEach(function (button) {
  button.addEventListener("click", function () { showTech(button.dataset.tech); });
});


/* ---------------------------------------------------------------------
   12. RUN ONCE WHEN THE PAGE LOADS
--------------------------------------------------------------------- */
el.challengeCount.textContent = challengeCount;
loadTasks();                                        // ask the API for the tasks
setInterval(checkBackend, HEALTH_CHECK_EVERY);      // keep watching the backend
showTech("nextjs");
