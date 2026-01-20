console.log("Frontend MVP loaded");

const form = document.getElementById("create-outing-form");
const messageEl = document.getElementById("message");
const outingsListEl = document.getElementById("outings-list");
const requestsListEl = document.getElementById("requests-list");

/* =========================
   AP-2: CREATE OUTING
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
   AP-3 + AP-4 + AP-5: LOAD OUTINGS
   ========================= */
async function loadOutings() {
  outingsListEl.innerHTML = "";
  const outings = await getOutings();

  outings.forEach((outing) => {
    const li = document.createElement("li");
    li.textContent = `${outing.title} | ${outing.activity_type}`;

    const interestBtn = document.createElement("button");
    interestBtn.textContent = "I'm interested";
    interestBtn.style.marginLeft = "10px";

    interestBtn.onclick = async () => {
      await expressInterest(outing.id);
      alert("Interest sent");
    };

    const viewRequestsBtn = document.createElement("button");
    viewRequestsBtn.textContent = "View requests";
    viewRequestsBtn.style.marginLeft = "10px";

    viewRequestsBtn.onclick = () => loadRequests(outing.id);

    li.appendChild(interestBtn);
    li.appendChild(viewRequestsBtn);
    outingsListEl.appendChild(li);
  });
}

/* =========================
   AP-5: LOAD INTEREST REQUESTS
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
        acceptBtn.style.marginLeft = "10px";

        const rejectBtn = document.createElement("button");
        rejectBtn.textContent = "Reject";
        rejectBtn.style.marginLeft = "5px";

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
  } catch (err) {
    requestsListEl.innerHTML = "<li>Not authorized or error</li>";
  }
}

/* =========================
   INITIAL LOAD
   ========================= */
loadOutings();
