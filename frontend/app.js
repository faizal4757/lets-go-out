console.log("Frontend MVP loaded");

const form = document.getElementById("create-outing-form");
const messageEl = document.getElementById("message");
const outingsListEl = document.getElementById("outings-list");
const requestsListEl = document.getElementById("requests-list");

const userSelector = document.getElementById("user-selector");
const currentUserLabel = document.getElementById("current-user-label");

/* =========================
   USER SWITCHING (AP-6)
   ========================= */
function updateUserUI() {
  currentUserLabel.textContent = window.currentUser;
}

userSelector.addEventListener("change", () => {
  setCurrentUser(userSelector.value);
  updateUserUI();
  loadOutings();
  requestsListEl.innerHTML = "<li>Select one of your outings</li>";
});

/* =========================
   CREATE OUTING (AP-2)
   ========================= */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    title: document.getElementById("title").value,
    activity_type: document.getElementById("type").value,
    date_time: document.getElementById("date_time").value,
    location: document.getElementById("location").value
  };

  try {
    await createOuting(payload);
    messageEl.textContent = "Outing created successfully";
    form.reset();
    loadOutings();
  } catch (err) {
    messageEl.textContent = err.message;
  }
});

/* =========================
   LOAD OUTINGS (AP-3 → AP-7)
   ========================= */
async function loadOutings() {
  outingsListEl.innerHTML = "";
  const outings = await getOutings();

  outings.forEach((outing) => {
    const li = document.createElement("li");

    li.textContent = `${outing.title} | ${outing.activity_type}`;

    /* HOST VIEW */
    if (outing.host_user_id === window.currentUser) {
      const viewRequestsBtn = document.createElement("button");
      viewRequestsBtn.textContent = "View requests";
      viewRequestsBtn.style.marginLeft = "10px";
      viewRequestsBtn.onclick = () => loadRequests(outing.id);
      li.appendChild(viewRequestsBtn);
    }

    /* GUEST VIEW */
    if (outing.host_user_id !== window.currentUser) {
      const interestBtn = document.createElement("button");
      interestBtn.textContent = "I'm interested";
      interestBtn.style.marginLeft = "10px";

      interestBtn.onclick = async () => {
        await expressInterest(outing.id);
        interestBtn.disabled = true;
        interestBtn.textContent = "Interest sent";
      };

      li.appendChild(interestBtn);
    }

    outingsListEl.appendChild(li);
  });
}

/* =========================
   LOAD INTEREST REQUESTS (AP-5)
   ========================= */
async function loadRequests(outingId) {
  requestsListEl.innerHTML = "";

  try {
    const requests = await getInterestRequests(outingId);

    if (requests.length === 0) {
      requestsListEl.innerHTML = "<li>No requests yet</li>";
      return;
    }

    requests.forEach((req) => {
      const li = document.createElement("li");
      li.textContent = `User: ${req.requester_user_id} | Status: ${req.status}`;

      if (req.status === "pending") {
        const acceptBtn = document.createElement("button");
        acceptBtn.textContent = "Accept";

        const rejectBtn = document.createElement("button");
        rejectBtn.textContent = "Reject";

        acceptBtn.onclick = async () => {
          await updateInterestStatus(req.id, "accepted");
          loadRequests(outingId);
        };

        rejectBtn.onclick = async () => {
          await updateInterestStatus(req.id, "rejected");
          loadRequests(outingId);
        };

        li.appendChild(acceptBtn);
        li.appendChild(rejectBtn);
      }

      requestsListEl.appendChild(li);
    });
  } catch {
    requestsListEl.innerHTML = "<li>Not authorized</li>";
  }
}

/* =========================
   INITIAL LOAD
   ========================= */
updateUserUI();
loadOutings();
