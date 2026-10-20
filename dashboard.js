/* =====================================================================
   TechBridge Intern Dashboard  (Task 6)
   What this file does:
     1. Holds the 8 internship tasks as DATA (an array of objects)
     2. Builds the task cards from that data
     3. Lets the intern mark tasks completed, and updates the progress
     4. Filters tasks and opens a details pop-up
     5. Runs the Technology Explorer (Next.js, Vue, Angular, Backend)
   Nothing here reloads the page.
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. THE DATA
   Each task is an OBJECT. All eight live in one ARRAY.
   The cards on the page are generated from this list, so the HTML never
   has to repeat itself eight times.
   "status" starts empty: updateStatuses() works it out from what the
   intern has completed.
--------------------------------------------------------------------- */
const totalTasks = 8;
const challengeCount = 10;                 // how many challenges the Challenge Hub has
const STORAGE_KEY = "techbridge-dashboard-progress";
const defaultCompleted = [1, 2, 3, 4, 5];  // the demo starts with Tasks 1 to 5 done

const intern = {
  name: "Joshua",
  role: "Web Development Intern"
};

const tasks = [
  { number: 1, title: "Build the TechBridge Homepage", day: 1, difficulty: "Beginner",
    description: "Create the first version of the TechBridge website using HTML and CSS.",
    build: ["A first working version of the homepage", "Page structure written in HTML5", "Colours, spacing and layout styled with CSS"],
    skills: ["HTML", "CSS"],
    page: "index.html", pageLabel: "Open the homepage", status: "" },

  { number: 2, title: "Build the Programs Experience", day: 4, difficulty: "Beginner",
    description: "Create a Programs page that presents TechBridge's available learning programs.",
    build: ["A Programs page for the two tracks", "The same look and feel as the homepage", "Navigation that links the pages together"],
    skills: ["Page layout", "Consistent styling"],
    page: "programs.html", pageLabel: "Open the Programs page", status: "" },

  { number: 3, title: "Build the Internship Tasks Experience", day: 8, difficulty: "Beginner → Intermediate",
    description: "Create an interface that presents the internship tasks and helps visitors understand the journey.",
    build: ["An interface that shows all eight tasks", "A clear sequence that explains the journey", "A layout that works on desktop, tablet and mobile"],
    skills: ["Responsive layout", "Visual hierarchy"],
    page: "tasks.html", pageLabel: "Open the Tasks page", status: "" },

  { number: 4, title: "Build an Interactive Internship Roadmap", day: 11, difficulty: "Beginner → Intermediate",
    description: "Use JavaScript to let visitors switch between the Data Analytics and Web Development tracks.",
    build: ["Track buttons that change the page without reloading", "Task cards generated from JavaScript data", "A journey bar that updates for each track"],
    skills: ["JavaScript", "Arrays and objects", "DOM manipulation"],
    page: "roadmap.html", pageLabel: "Open the Roadmap", status: "" },

  { number: 5, title: "Build the Challenge Hub", day: 15, difficulty: "Intermediate",
    description: "Create a hub where visitors can browse, filter and explore practical challenges from both tracks.",
    build: ["Challenge cards with track and difficulty", "Track, difficulty and search filters", "A details pop-up and a glass carousel"],
    skills: ["Filtering", "Event listeners", "Modals"],
    page: "challenges.html", pageLabel: "Open the Challenge Hub", status: "" },

  { number: 6, title: "Build the Intern Dashboard", day: 19, difficulty: "Intermediate",
    description: "Create a dashboard where an intern can see their progress, track their tasks and explore modern web technologies.",
    build: ["A progress section that updates as tasks are completed", "A task tracker with filters and details", "A Technology Explorer for frontend and backend tools"],
    skills: ["State and progress logic", "Dynamic HTML", "Responsive layout"],
    page: "dashboard.html", pageLabel: "", status: "" },

  { number: 7, title: "Build the Task Submission System", day: 22, difficulty: "Intermediate",
    description: "Create an interface through which interns can prepare and submit their task work.",
    build: ["An interface where interns prepare their task work", "A way for interns to submit that work"],
    skills: ["Forms", "Workflow design"],
    page: "", pageLabel: "", status: "" },

  { number: 8, title: "Build the Complete Internship Platform", day: 26, difficulty: "Intermediate",
    description: "Combine the components built during the internship into one complete TechBridge platform.",
    build: ["The earlier components combined into one platform", "A complete experience from first visit to dashboard"],
    skills: ["Integration", "Project completion"],
    page: "", pageLabel: "", status: "" }
];

// Words shown for each status, and a small symbol so colour is never the only clue.
const statusLabels = { "completed": "Completed", "in-progress": "In Progress", "not-started": "Not Started" };
const statusIcons  = { "completed": "✓", "in-progress": "●", "not-started": "○" };

// Difficulty text -> number 1 to 3 (used by the little bars).
const levelNumbers = { "Beginner": 1, "Beginner → Intermediate": 2, "Intermediate": 3 };


/* ---------------------------------------------------------------------
   2. STATE: the few values that change while the page is open
   Instead of storing every task's status by hand, we only remember
   WHICH TASK NUMBERS are completed. Everything else is worked out from
   that one list. One source of truth means fewer bugs.
--------------------------------------------------------------------- */
let completedNumbers = loadProgress();
let currentFilter = "all";
let lastCompleted = null;      // the task just completed (used for a short highlight)
let toastTimer = null;


/* ---------------------------------------------------------------------
   3. PARTS OF THE PAGE WE NEED TO CHANGE
--------------------------------------------------------------------- */
const el = {
  name:        document.getElementById("intern-name"),
  role:        document.getElementById("intern-role"),
  message:     document.getElementById("welcome-message"),
  status:      document.getElementById("intern-status"),
  currentLine: document.getElementById("current-task-line"),
  continueBtn: document.getElementById("continue-btn"),

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
   4. SAVING AND LOADING (Local Storage)
   localStorage is a small notebook inside the visitor's browser. It
   keeps data even after the tab is closed. It is wrapped in try/catch
   because some browsers (private mode) refuse to let us use it.
--------------------------------------------------------------------- */
function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.every(function (n) { return Number.isInteger(n) && n >= 1 && n <= totalTasks; })) {
      return saved;
    }
  } catch (error) {
    /* ignore: we fall back to the demo progress below */
  }
  return defaultCompleted.slice();   // slice() makes a copy so the original is never changed
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completedNumbers));
  } catch (error) {
    /* ignore: the dashboard still works, it just will not remember */
  }
}


/* ---------------------------------------------------------------------
   5. CONDITIONAL LOGIC AND PROGRESS MATH
--------------------------------------------------------------------- */

// Work out every task's status from the completed list.
//   completed       -> its number is in the list
//   in-progress     -> the FIRST task that is not completed (the current task)
//   not-started     -> everything after that
function updateStatuses() {
  let currentFound = false;
  tasks.forEach(function (task) {
    if (completedNumbers.includes(task.number)) {
      task.status = "completed";
    } else if (!currentFound) {
      task.status = "in-progress";
      currentFound = true;
    } else {
      task.status = "not-started";
    }
  });
}

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

function findTask(number) {
  return tasks.find(function (task) { return task.number === number; });
}


/* ---------------------------------------------------------------------
   6. DRAWING THE PAGE
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

function renderProgress(done) {
  const remaining = totalTasks - done;
  const percent = getPercent(done);

  el.summary.textContent = done + " / " + totalTasks + " Tasks Completed, " + remaining + (remaining === 1 ? " Task Remaining" : " Tasks Remaining");
  el.pctBig.textContent = percent;
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

  el.grid.classList.toggle("animate", animate);
  el.grid.innerHTML = list.map(buildTaskCard).join("");

  el.count.textContent = "Showing " + list.length + " of " + tasks.length + " tasks";
  el.grid.hidden = list.length === 0;
  el.empty.hidden = list.length !== 0;
}

// One function to refresh everything that depends on the data.
function renderAll(animateGrid) {
  updateStatuses();
  const done = countCompleted();
  renderWelcome(done);
  renderProgress(done);
  renderFilterCounts();
  renderTasks(animateGrid === true);
}


/* ---------------------------------------------------------------------
   7. CHANGING PROGRESS
--------------------------------------------------------------------- */
function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.toast.classList.remove("show"); }, 4000);
}

function completeTask(number) {
  if (!completedNumbers.includes(number)) {
    completedNumbers.push(number);
  }
  lastCompleted = number;
  saveProgress();
  renderAll();

  const done = countCompleted();
  if (done === totalTasks) {
    showToast("All 8 tasks completed. Congratulations!");
  } else {
    showToast("Task " + number + " completed. " + done + " / " + totalTasks + " done (" + getPercent(done) + "%).");
  }
}

function undoTask(number) {
  // filter() keeps everything EXCEPT this number
  completedNumbers = completedNumbers.filter(function (n) { return n !== number; });
  lastCompleted = null;
  saveProgress();
  renderAll();
  showToast("Task " + number + " moved back to your to-do list.");
}

function resetProgress() {
  completedNumbers = defaultCompleted.slice();
  lastCompleted = null;
  saveProgress();
  renderAll();
  showToast("Progress reset to the demo state.");
}


/* ---------------------------------------------------------------------
   8. THE TASK DETAILS POP-UP
   Same <dialog> idea as the Challenge Hub: showModal() opens it on top
   of the page without leaving it.
--------------------------------------------------------------------- */
function openTask(number) {
  const task = findTask(number);
  if (!task) { return; }

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

  el.modalBody.innerHTML = `
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

function closeModal() {
  if (typeof el.modal.close === "function") { el.modal.close(); } else { el.modal.removeAttribute("open"); }
  document.body.classList.remove("modal-open");
}


/* ---------------------------------------------------------------------
   9. EVENT LISTENERS
   EVENT DELEGATION: the cards are rebuilt every time, so instead of
   attaching a listener to every button we listen ONCE on the parent
   and use closest() to see which button was clicked.
--------------------------------------------------------------------- */

// Buttons inside the task grid: View, Complete, Undo
el.grid.addEventListener("click", function (event) {
  const viewBtn     = event.target.closest("[data-view]");
  const completeBtn = event.target.closest("[data-complete]");
  const undoBtn     = event.target.closest("[data-undo]");

  if (viewBtn) {
    openTask(Number(viewBtn.dataset.view));
  } else if (completeBtn) {
    const n = Number(completeBtn.dataset.complete);
    completeTask(n);
    focusCard(n);
  } else if (undoBtn) {
    const n = Number(undoBtn.dataset.undo);
    undoTask(n);
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

// Buttons inside the pop-up
el.modal.addEventListener("click", function (event) {
  if (event.target.closest("[data-close]") || event.target === el.modal) {
    closeModal();
    return;
  }
  const completeBtn = event.target.closest("[data-complete]");
  const undoBtn     = event.target.closest("[data-undo]");
  if (completeBtn) {
    const n = Number(completeBtn.dataset.complete);
    completeTask(n);
    openTask(n);                                   // redraw the pop-up with the new status
    const again = el.modalBody.querySelector("[data-undo]");
    if (again) { again.focus(); }
  } else if (undoBtn) {
    const n = Number(undoBtn.dataset.undo);
    undoTask(n);
    openTask(n);
    const again = el.modalBody.querySelector("[data-complete]");
    if (again) { again.focus(); }
  }
});
el.modal.addEventListener("close", function () {
  document.body.classList.remove("modal-open");
});

// Filter buttons: All / Completed / In Progress / Not Started
el.filterBtns.forEach(function (button) {
  button.addEventListener("click", function () {
    currentFilter = button.dataset.filter;
    el.filterBtns.forEach(function (b) {
      b.setAttribute("aria-pressed", b === button ? "true" : "false");
    });
    renderTasks(true);
  });
});

el.resetBtn.addEventListener("click", resetProgress);


/* ---------------------------------------------------------------------
   10. TECHNOLOGY EXPLORER
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
    note: "Right now your dashboard remembers progress using Local Storage, which lives only in this one browser. With a backend and a database, Joshua's progress would be saved on a server, so it would be the same on a phone, a laptop or any other device.",
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
   11. RUN ONCE WHEN THE PAGE LOADS
--------------------------------------------------------------------- */
el.challengeCount.textContent = challengeCount;
renderAll();
showTech("nextjs");
