// BarangayConnect front-end

var currentService = ""; // code of the service the user is applying for

// ---------- light / dark mode ----------

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  var button = document.getElementById("themeBtn");
  if (theme == "dark") {
    button.textContent = "\u2600\uFE0F"; // sun icon: click to go back to light
  } else {
    button.textContent = "\uD83C\uDF19"; // moon icon: click to go dark
  }
  localStorage.setItem("theme", theme);
}

function toggleTheme() {
  var current = document.documentElement.getAttribute("data-theme");
  if (current == "dark") {
    setTheme("light");
  } else {
    setTheme("dark");
  }
}

// when the page loads, use the saved choice (or the computer's setting)
var savedTheme = localStorage.getItem("theme");
if (!savedTheme) {
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    savedTheme = "dark";
  } else {
    savedTheme = "light";
  }
}
setTheme(savedTheme);

// ---------- helper functions ----------

function openBox(id) {
  document.getElementById(id).showModal();
}

function closeBox(id) {
  document.getElementById(id).close();
}

// show a message (green if ok, red if error)
function showMessage(id, text, isError) {
  var p = document.getElementById(id);
  p.textContent = text;
  if (isError) {
    p.className = "msg err";
  } else {
    p.className = "msg ok";
  }
}

// send data to the server and get the answer back
async function sendToServer(url, method, data) {
  var options = { method: method, headers: { "Content-Type": "application/json" } };
  if (data) {
    options.body = JSON.stringify(data);
  }
  var response = await fetch(url, options);
  var responseText = await response.text();
  var result;
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch (error) {
    if (response.status === 403) {
      throw new Error("The server blocked this API request (403 Forbidden). Verify that the site is deployed with its Express API, not as a static-only site.");
    }
    throw new Error("The API returned an unexpected response (HTTP " + response.status + "). Verify the server deployment and API routes.");
  }
  if (!response.ok) {
    throw new Error(result.error || "Request failed (HTTP " + response.status + ").");
  }
  return result;
}

// ---------- login and register ----------

// show or hide the password the user is typing
function togglePassword(inputId, button) {
  var input = document.getElementById(inputId);
  if (input.type == "password") {
    input.type = "text";
    button.textContent = "Hide";
  } else {
    input.type = "password";
    button.textContent = "Show";
  }
}

function clearAuthControls() {
  var auth = document.getElementById("auth");
  var status = document.getElementById("authMsg");
  while (auth.firstChild) {
    auth.removeChild(auth.firstChild);
  }
  auth.appendChild(status);
}

function setAuthMessage(text) {
  var status = document.getElementById("authMsg");
  status.textContent = text;
  status.hidden = !text;
}

function showLoggedOut() {
  clearAuthControls();
  setAuthMessage("");
  var status = document.getElementById("authMsg");
  var loginButton = document.createElement("button");
  loginButton.className = "btn btn-solid";
  loginButton.textContent = "LOGIN";
  loginButton.addEventListener("click", function () { openBox("loginBox"); });

  var registerButton = document.createElement("button");
  registerButton.className = "btn btn-outline";
  registerButton.textContent = "REGISTER";
  registerButton.addEventListener("click", function () { openBox("registerBox"); });

  var auth = document.getElementById("auth");
  auth.insertBefore(loginButton, status);
  auth.insertBefore(registerButton, status);
}

function showLoggedIn(user) {
  clearAuthControls();
  setAuthMessage("");
  var auth = document.getElementById("auth");
  var greeting = document.createElement("span");
  greeting.textContent = "Hello, " + user.full_name;
  auth.insertBefore(greeting, document.getElementById("authMsg"));

  if (user.role === "admin") {
    var adminButton = document.createElement("button");
    adminButton.className = "btn btn-outline";
    adminButton.textContent = "ADMIN REQUESTS";
    adminButton.addEventListener("click", openAdminPanel);
    auth.insertBefore(adminButton, document.getElementById("authMsg"));
  }

  var logoutButton = document.createElement("button");
  logoutButton.className = "btn btn-outline";
  logoutButton.textContent = "LOGOUT";
  logoutButton.addEventListener("click", logoutUser);
  auth.insertBefore(logoutButton, document.getElementById("authMsg"));
}

async function logoutUser() {
  try {
    await sendToServer("/api/logout", "POST");
    document.getElementById("adminPanel").hidden = true;
    showLoggedOut();
  } catch (error) {
    setAuthMessage(error.message);
  }
}

async function loginUser() {
  var email = document.getElementById("loginEmail").value;
  var password = document.getElementById("loginPassword").value;
  try {
    var result = await sendToServer("/api/login", "POST", { email: email, password: password });
    showLoggedIn(result.user);
    closeBox("loginBox");
  } catch (error) {
    showMessage("loginMsg", error.message, true);
  }
}

async function registerUser() {
  var data = {
    full_name: document.getElementById("regName").value,
    email: document.getElementById("regEmail").value,
    password: document.getElementById("regPassword").value
  };
  try {
    var result = await sendToServer("/api/register", "POST", data);
    showLoggedIn(result.user);
    closeBox("registerBox");
  } catch (error) {
    showMessage("regMsg", error.message, true);
  }
}

async function restoreLogin() {
  try {
    var result = await sendToServer("/api/me", "GET");
    if (result.user) {
      showLoggedIn(result.user);
    } else {
      showLoggedOut();
    }
  } catch (error) {
    showLoggedOut();
    setAuthMessage(error.message || "Could not restore sign-in. Please log in again.");
    console.error(error);
  }
}

restoreLogin();

// ---------- administrator request management ----------

var adminRequestStatuses = ["Received", "In Review", "Approved", "Rejected", "Completed"];

function showAdminMessage(text, isError) {
  var message = document.getElementById("adminMsg");
  message.textContent = text || "";
  message.className = text ? (isError ? "msg err" : "msg ok") : "msg";
}

function addAdminCell(row, value) {
  var cell = document.createElement("td");
  cell.textContent = value || "—";
  row.appendChild(cell);
  return cell;
}

function formatRequestDate(value) {
  if (!value) {
    return "—";
  }
  var date = new Date(value);
  return isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function renderAdminRequests(requests) {
  var body = document.getElementById("adminRequestsBody");
  while (body.firstChild) {
    body.removeChild(body.firstChild);
  }
  if (requests.length === 0) {
    var emptyRow = body.insertRow();
    var emptyCell = emptyRow.insertCell();
    emptyCell.colSpan = 8;
    emptyCell.textContent = "No service requests have been submitted.";
    return;
  }

  requests.forEach(function (request) {
    var row = body.insertRow();
    addAdminCell(row, request.reference);
    addAdminCell(row, request.service);
    addAdminCell(row, request.full_name);
    addAdminCell(row, request.contact);
    addAdminCell(row, request.details);

    var statusCell = row.insertCell();
    var statusSelect = document.createElement("select");
    statusSelect.setAttribute("aria-label", "Status for request " + request.reference);
    adminRequestStatuses.forEach(function (status) {
      var option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      statusSelect.appendChild(option);
    });
    statusSelect.value = request.status;
    statusCell.appendChild(statusSelect);
    addAdminCell(row, formatRequestDate(request.created_at));

    var actions = row.insertCell();
    var actionGroup = document.createElement("div");
    actionGroup.className = "admin-actions";
    var saveButton = document.createElement("button");
    saveButton.className = "btn btn-solid";
    saveButton.type = "button";
    saveButton.textContent = "SAVE";
    saveButton.addEventListener("click", function () {
      updateRequestStatus(request.reference, statusSelect.value);
    });
    var deleteButton = document.createElement("button");
    deleteButton.className = "btn btn-outline admin-delete";
    deleteButton.type = "button";
    deleteButton.textContent = "DELETE";
    deleteButton.addEventListener("click", function () {
      deleteRequest(request.reference);
    });
    actionGroup.appendChild(saveButton);
    actionGroup.appendChild(deleteButton);
    actions.appendChild(actionGroup);
  });
}

async function loadAdminRequests() {
  var body = document.getElementById("adminRequestsBody");
  while (body.firstChild) {
    body.removeChild(body.firstChild);
  }
  var loadingRow = body.insertRow();
  var loadingCell = loadingRow.insertCell();
  loadingCell.colSpan = 8;
  loadingCell.textContent = "Loading requests...";
  try {
    var result = await sendToServer("/api/admin/requests", "GET");
    renderAdminRequests(result.requests);
    return true;
  } catch (error) {
    showAdminMessage(error.message, true);
    var errorRow = body.insertRow();
    var errorCell = errorRow.insertCell();
    errorCell.colSpan = 8;
    errorCell.textContent = "Requests could not be loaded.";
    return false;
  }
}

async function openAdminPanel() {
  var panel = document.getElementById("adminPanel");
  panel.hidden = false;
  showAdminMessage("", false);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  await loadAdminRequests();
}

function closeAdminPanel() {
  document.getElementById("adminPanel").hidden = true;
}

async function updateRequestStatus(reference, status) {
  try {
    await sendToServer("/api/admin/requests/" + encodeURIComponent(reference), "PATCH", { status: status });
    if (await loadAdminRequests()) {
      showAdminMessage("Request " + reference + " status updated to " + status + ".", false);
    }
  } catch (error) {
    showAdminMessage(error.message, true);
  }
}

async function deleteRequest(reference) {
  if (!window.confirm("Delete request " + reference + "? This cannot be undone.")) {
    return;
  }
  try {
    await sendToServer("/api/admin/requests/" + encodeURIComponent(reference), "DELETE");
    if (await loadAdminRequests()) {
      showAdminMessage("Request " + reference + " deleted.", false);
    }
  } catch (error) {
    showAdminMessage(error.message, true);
  }
}

// ---------- apply for a service ----------

function openApply(code, name) {
  currentService = code;
  document.getElementById("applyTitle").textContent = "Apply: " + name;
  document.getElementById("applyName").value = "";
  document.getElementById("applyContact").value = "";
  document.getElementById("applyDetails").value = "";
  document.getElementById("lookupMsg").textContent = "";
  document.getElementById("applyMsg").textContent = "";
  document.getElementById("applyLookup").hidden = false;
  document.getElementById("applyForm").hidden = true;
  document.getElementById("applyDuplicate").hidden = true;
  openBox("applyBox");
}

function showExistingRequest(result) {
  document.getElementById("applyLookup").hidden = true;
  document.getElementById("applyForm").hidden = true;
  document.getElementById("applyDuplicate").hidden = false;
  document.getElementById("duplicateMsg").textContent =
    "You have already filed this request. Reference number: " + result.reference +
    ". Status: " + result.status + ".";
}

async function checkExistingRequest() {
  var data = {
    service_code: currentService,
    full_name: document.getElementById("applyName").value,
    contact: document.getElementById("applyContact").value
  };
  try {
    var result = await sendToServer("/api/requests/check", "POST", data);
    if (result.alreadyExists) {
      showExistingRequest(result);
      return;
    }
    document.getElementById("applyLookup").hidden = true;
    document.getElementById("applyForm").hidden = false;
  } catch (error) {
    showMessage("lookupMsg", error.message, true);
  }
}

async function submitRequest() {
  var data = {
    service_code: currentService,
    full_name: document.getElementById("applyName").value,
    contact: document.getElementById("applyContact").value,
    details: document.getElementById("applyDetails").value
  };
  try {
    var result = await sendToServer("/api/requests", "POST", data);
    if (result.alreadyExists) {
      showExistingRequest(result);
      return;
    }
    showMessage("applyMsg", "Request sent! Your reference number is " + result.reference + ". Save it to track your request.", false);
  } catch (error) {
    showMessage("applyMsg", error.message, true);
  }
}

// ---------- track a request ----------

async function trackRequest() {
  var ref = document.getElementById("trackRef").value;
  try {
    var result = await sendToServer("/api/requests/" + ref, "GET");
    showMessage("trackMsg", result.service + " - Status: " + result.status, false);
  } catch (error) {
    showMessage("trackMsg", error.message, true);
  }
}
