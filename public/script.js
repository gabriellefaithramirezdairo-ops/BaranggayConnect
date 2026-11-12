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
  var result = await response.json();
  if (!response.ok) {
    throw new Error(result.error);
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

function showLoggedIn(name) {
  document.getElementById("auth").innerHTML =
    "<span>Hello, " + name + "</span> " +
    "<button class='btn btn-outline' onclick='logoutUser()'>LOGOUT</button>";
}

function logoutUser() {
  document.getElementById("auth").innerHTML =
    "<button class='btn btn-solid' onclick=\"openBox('loginBox')\">LOGIN</button>" +
    "<button class='btn btn-outline' onclick=\"openBox('registerBox')\">REGISTER</button>";
}

async function loginUser() {
  var email = document.getElementById("loginEmail").value;
  var password = document.getElementById("loginPassword").value;
  try {
    var result = await sendToServer("/api/login", "POST", { email: email, password: password });
    showLoggedIn(result.full_name);
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
    showLoggedIn(result.full_name);
    closeBox("registerBox");
  } catch (error) {
    showMessage("regMsg", error.message, true);
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
