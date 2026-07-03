// ============================================================
// script.js (FINAL – Search + Filter Fully Working + commented)
// ============================================================

console.log("script.js loaded"); // simple log to confirm script loaded

// Firebase compat references
const auth = firebase.auth();             // firebase auth instance (compat)
const db = firebase.firestore();          // firebase firestore instance (compat)

// State
let currentUserProfile = null;            // will hold the logged-in user's profile document
let selectedRequestDocId = null;          // currently selected appointment doc id (for details/actions)

// Search + Filter cache
let coordinatorCache = [];                // cache of coordinator's assigned appointments for filtering/searching

// DOM References
const registerPage = document.getElementById('registerPage');
const loginPage = document.getElementById('loginPage');
const studentDashboard = document.getElementById('studentDashboard');
const coordinatorDashboard = document.getElementById('coordinatorDashboard');
const studentMsg = document.getElementById('studentMsg');
const requestList = document.getElementById('requestList');
const facultySelect = document.getElementById('faculty');

// Popups & UI pieces
const successPopup = document.getElementById('successPopup');
const successLottie = document.getElementById('successLottie');
const successText = document.getElementById('successText');

const detailsPopup = document.getElementById('detailsPopup');
const rejectPopup = document.getElementById('rejectPopup');

// Search and Filter inputs (coordinator UI)
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");

// Details Popup Elements (for showing student info when coordinator opens a request)
const d_name = document.getElementById('d_name');
const d_usn = document.getElementById('d_usn');
const d_email = document.getElementById('d_email');
const d_dept = document.getElementById('d_dept');
const d_branch = document.getElementById('d_branch');
const d_year = document.getElementById('d_year');
const d_purpose = document.getElementById('d_purpose');
const d_date_time = document.getElementById('d_date_time');

// ---------- Page visibility helpers ----------
function hideAllPages(){
  document.querySelectorAll('.page').forEach(p=>p.style.display='none');
  document.querySelectorAll('.overlay').forEach(o=>o.style.display='none');
}
function showRegister(){ hideAllPages(); registerPage.style.display='block'; }
function showLogin(){ hideAllPages(); loginPage.style.display='block'; }
function showStudentDashboard(){ hideAllPages(); studentDashboard.style.display='block'; }
function showCoordinatorDashboard(){ hideAllPages(); coordinatorDashboard.style.display='block'; }

// ----------- Register ----------
function toggleRegisterForm(){
  let role = document.getElementById('regRole').value;
  document.getElementById('studentFields').style.display = role==='student' ? 'block' : 'none';
  document.getElementById('coordFields').style.display = role==='coordinator' ? 'block' : 'none';
}

async function register(){
  try{
    let role = document.getElementById('regRole').value;
    let pass = (document.getElementById('regPass').value || "").trim();
    if(!pass) return alert("Enter a password");

    let email = role==='student'
      ? (document.getElementById('stuEmail').value || "").trim()
      : (document.getElementById('coEmail').value || "").trim();

    if(!email) return alert("Provide an email");

    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    const uid = cred.user.uid;

    let profile = { role, email, uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() };

    if(role==='student'){
      profile.name = document.getElementById('stuName').value.trim();
      profile.dept = document.getElementById('stuDept').value.trim();
      profile.branch = document.getElementById('stuBranch').value.trim();
      profile.year = document.getElementById('stuYear').value.trim();
      profile.userId = document.getElementById('stuUSN').value.trim();
    } else {
      profile.name = document.getElementById('coName').value.trim();
      profile.dept = document.getElementById('coDept').value.trim();
      profile.userId = document.getElementById('coUserId').value.trim();
    }

    await db.collection('users').doc(uid).set(profile);
    alert("Registered successfully!");
    showLogin();

  }catch(err){
    alert("Registration error: " + err.message);
  }
}

// ----------- Login ----------
async function login(){
  try{
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    await auth.signInWithEmailAndPassword(email, pass);
  }catch(err){
    alert("Login failed: "+err.message);
  }
}

// ----------- Logout ----------
function logout(){
  auth.signOut();
  currentUserProfile = null;
  selectedRequestDocId = null;
  hideAllPages();
  showLogin();
}

// ----------- Auth Routing (onAuthStateChanged) ----------
let studentListenerUnsub = null;
let coordinatorListenerUnsub = null;
let coordinatorsListenerUnsub = null;

auth.onAuthStateChanged(async (user)=>{

  if(studentListenerUnsub) studentListenerUnsub();
  if(coordinatorListenerUnsub) coordinatorListenerUnsub();
  if(coordinatorsListenerUnsub) coordinatorsListenerUnsub();

  if(!user){
    hideAllPages();
    showLogin();
    return;
  }

  const doc = await db.collection('users').doc(user.uid).get();
  if(!doc.exists) {
    await auth.signOut();
    return alert("Profile missing. Please register.");
  }

  currentUserProfile = doc.data();

  // load coordinators for student dropdown
  coordinatorsListenerUnsub = db.collection('users')
    .where('role','==','coordinator')
    .onSnapshot(snap => renderCoordinators(snap));

  if(currentUserProfile.role === "student"){
    showStudentDashboard();
    loadStudentDetails();

    studentListenerUnsub = db.collection('appointments')
      .where('studentUid','==', user.uid)
      .orderBy('createdAt','desc')
      .onSnapshot(snap => renderStudentAppointments(snap));

  } else {
    // coordinator page
    showCoordinatorDashboard();

    // populate coordinator profile fields (fix for missing profile shown earlier)
    document.getElementById('c_name').innerText = "Name: " + (currentUserProfile.name || "");
    document.getElementById('c_email').innerText = "Email: " + (currentUserProfile.email || "");
    document.getElementById('c_dept').innerText = "Dept: " + (currentUserProfile.dept || "");

    coordinatorListenerUnsub = db.collection('appointments')
      .where('facultyUid','==', user.uid)
      .onSnapshot(snap => renderCoordinatorRequests(snap));
  }
});

/* ---------- Student Helpers ---------- */
function loadStudentDetails(){
  document.getElementById('s_name').innerText = "Name: " + (currentUserProfile.name || "");
  document.getElementById('s_email').innerText = "Email: " + (currentUserProfile.email || "");
  document.getElementById('s_dept').innerText = "Dept: " + (currentUserProfile.dept || "");
  document.getElementById('s_branch').innerText = "Branch: " + (currentUserProfile.branch || "");
  document.getElementById('s_year').innerText = "Year: " + (currentUserProfile.year || "");
  document.getElementById('s_usn').innerText = "USN: " + (currentUserProfile.userId || "");
  document.getElementById('date').setAttribute("min", new Date().toISOString().split("T")[0]);
}

function renderCoordinators(snap){
  facultySelect.innerHTML = '<option value="">Select Coordinator</option>';
  snap.forEach(doc=>{
    const d = doc.data();
    const opt = document.createElement('option');
    opt.value = doc.id;
    opt.textContent = `${d.name} (${d.dept})`;
    facultySelect.appendChild(opt);
  });
}

/* ---------- Submit Appointment ---------- */
async function submitAppointment(){
  const purpose = document.getElementById('purpose').value.trim();
  const facultyUid = facultySelect.value;
  const facultyName = facultySelect.options[facultySelect.selectedIndex]?.textContent;
  const date = document.getElementById('date').value;
  const time = document.getElementById('time').value;

  if(!purpose || !facultyUid || !date || !time) return alert("Fill all fields");

  await db.collection('appointments').add({
    studentUid: auth.currentUser.uid,
    studentId: currentUserProfile.userId,
    studentName: currentUserProfile.name,
    facultyUid,
    facultyName,
    purpose,
    date,
    time,
    status: "Pending",
    suggestedDate: "",
    suggestedTime: "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  showSuccess("Appointment Sent");
}

/* ---------- Student Apps List ---------- */
function renderStudentAppointments(snap){
  studentMsg.innerHTML = "";
  if(snap.empty){
    studentMsg.innerHTML = "<p>No appointments yet.</p>";
    return;
  }

  snap.forEach(doc=>{
    const r = doc.data();
    const id = doc.id;

    const withdrawBtn = r.status === "Pending"
      ? `<button class="btn small red" onclick="withdrawAppointment('${id}')">Withdraw</button>`
      : "";

    studentMsg.innerHTML += `
      <div class="request-card">
        <div>
          <p><b>Coordinator:</b> ${r.facultyName}</p>
          <p><b>Purpose:</b> ${r.purpose}</p>
          <p><b>Date:</b> ${r.date} <b>Time:</b> ${r.time}</p>
          <p><b>Status:</b> ${r.status}</p>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
          ${badgeHTML(r.status)}
          ${withdrawBtn}
          <button class="btn small cancel" onclick="deleteAppointment('${id}')">Delete</button>
        </div>
      </div>
    `;
  });
}

/* ============================================================
   COORDINATOR — SEARCH + FILTER
   ============================================================ */

function renderCoordinatorRequests(snap){
  coordinatorCache = [];
  snap.forEach(doc=>{
    let r = doc.data();
    r.id = doc.id;
    coordinatorCache.push(r);
  });

  // update counts based on all assigned docs (withdrawn not counted)
  let pending = 0, approved = 0, rejected = 0;
  coordinatorCache.forEach(r=>{
    if(r.status === "Pending") pending++;
    if(r.status === "Approved") approved++;
    if(r.status === "Rejected") rejected++;
    // do not count Withdrawn
  });

  document.getElementById("stat_pending").innerText = pending;
  document.getElementById("stat_approved").innerText = approved;
  document.getElementById("stat_rejected").innerText = rejected;

  renderCoordinatorFiltered();
}

function renderCoordinatorFiltered() {
  requestList.innerHTML = "";

  let search = (searchInput?.value || "").toLowerCase();
  let filter = statusFilter?.value || "all";

  const filtered = coordinatorCache.filter(r => {
    let matchSearch =
      (r.studentName || "").toLowerCase().includes(search) ||
      (r.studentId || "").toLowerCase().includes(search);

    let matchStatus =
      filter === "all" || r.status === filter;

    return matchSearch && matchStatus;
  });

  if(filtered.length === 0){
    requestList.innerHTML = `<p style="color:#ddd; padding:10px;">No appointments found.</p>`;
    return;
  }

  // Priority: Pending (1) -> Rejected (2) -> Approved (3)
  const priority = { "Pending": 1, "Rejected": 2, "Approved": 3 };

  // sort: first by priority, then for pending items by createdAt (oldest first)
  filtered.sort((a, b) => {
    const pa = priority[a.status] || 99;
    const pb = priority[b.status] || 99;
    if(pa !== pb) return pa - pb;

    // If both pending, sort by createdAt seconds ascending (oldest first)
    if(pa === 1 && pb === 1){
      return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
    }

    // otherwise keep current order
    return 0;
  });

  filtered.forEach(r => {
    requestList.innerHTML += `
      <div class="request-card">
        <div>
          <p><b>${r.studentName || r.studentId || "Student" } (${r.studentId || ""})</b></p>
          <p>${r.purpose || ""}</p>
          <p><b>Date:</b> ${r.date || "—"}  <b>Time:</b> ${r.time || "—"}</p>
          <p><b>Status:</b> ${r.status || "Pending"}</p>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;">
          ${badgeHTML(r.status)}
          <button class="btn small" onclick="openDetails('${r.id}')">View</button>
        </div>
      </div>
    `;
  });
}

/* ---------- Badge ---------- */
function badgeHTML(status){
  const s = (status || "Pending").toLowerCase();
  if(s==="approved") return `<span class="badge approved">Approved</span>`;
  if(s==="rejected") return `<span class="badge rejected">Rejected</span>`;
  if(s==="withdrawn") return `<span class="badge withdrawn">Withdrawn</span>`;
  return `<span class="badge pending">Pending</span>`;
}

/* ---------- DELETE / WITHDRAW ---------- */
async function deleteAppointment(docId){
  await db.collection('appointments').doc(docId).delete();
  showSuccess("Deleted");
}

async function withdrawAppointment(docId){
  await db.collection('appointments').doc(docId).update({
    status: "Withdrawn"
  });
  showSuccess("Withdrawn");
}

/* ---------- DETAILS POPUP ---------- */
async function openDetails(docId){
  selectedRequestDocId = docId;

  const snap = await db.collection('appointments').doc(docId).get();
  if(!snap.exists) return alert("Request not found");
  const req = snap.data();

  const stu = { };
  if(req.studentUid){
    const stuSnap = await db.collection('users').doc(req.studentUid).get();
    if(stuSnap.exists) Object.assign(stu, stuSnap.data());
  }

  d_name.innerText = "Name: " + (stu.name || req.studentName || "");
  d_usn.innerText = "USN: " + (stu.userId || req.studentId || "");
  d_email.innerText = "Email: " + (stu.email || "");
  d_dept.innerText = "Dept: " + (stu.dept || "");
  d_branch.innerText = "Branch: " + (stu.branch || "");
  d_year.innerText = "Year: " + (stu.year || "");
  d_purpose.innerText = "Purpose: " + (req.purpose || "");
  d_date_time.innerText = "Date & Time: " + (req.date || "—") + " — " + (req.time || "—");

  detailsPopup.style.display = 'flex';
}

function closeDetailsPopup(){
  detailsPopup.style.display='none';
}

/* ---------- Approve ---------- */
async function approveRequest(){
  if(!selectedRequestDocId) return;
  await db.collection('appointments').doc(selectedRequestDocId).update({
    status: "Approved"
  });
  closeDetailsPopup();
  showSuccess("Approved");
}

/* ---------- Reject ---------- */
function openRejectPopup(){
  if(!selectedRequestDocId) return;
  document.getElementById('suggestDate').value = "";
  document.getElementById('suggestTime').value = "";
  detailsPopup.style.display='none';
  rejectPopup.style.display='flex';
}

function closeRejectPopup(){
  rejectPopup.style.display='none';
}

async function submitSuggestion(){
  const d = document.getElementById('suggestDate').value;
  const t = document.getElementById('suggestTime').value;

  await db.collection('appointments').doc(selectedRequestDocId).update({
    status: "Rejected",
    suggestedDate: d,
    suggestedTime: t
  });

  closeRejectPopup();
  showSuccess("Suggestion Sent");
}

/* ---------- Success Popup ---------- */
function showSuccess(txt){
  successText.innerText = txt;
  successPopup.style.display='flex';
  try { successLottie.play(); } catch(e){}
  setTimeout(()=>{
    try { successLottie.stop(); } catch(e){}
    successPopup.style.display='none';
  },1000);
}

/* ---------- INIT ---------- */
searchInput?.addEventListener("input", renderCoordinatorFiltered);
statusFilter?.addEventListener("change", renderCoordinatorFiltered);

hideAllPages();
showLogin();

document.querySelectorAll('.overlay').forEach(o=>{
  o.addEventListener('click', (e)=>{
    if(e.target===o) o.style.display='none';
  });
});

function openCredits() {
  document.getElementById("creditPopup").style.display = "flex";
}
function closeCredits() {
  document.getElementById("creditPopup").style.display = "none";
}
