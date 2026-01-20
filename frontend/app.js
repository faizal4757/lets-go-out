console.log("Frontend MVP loaded");

const form = document.getElementById("create-outing-form");
const messageEl = document.getElementById("message");
const outingsListEl = document.getElementById("outings-list");

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
    loadOutings(); // refresh list
  } catch (err) {
    messageEl.textContent = err.message;
  }
});

/* =========================
   LOAD & DISPLAY OUTINGS (AP-3)
   ========================= */
async function loadOutings() {
  try {
    const outings = await getOutings();

    outingsListEl.innerHTML = "";

    if (outings.length === 0) {
      outingsListEl.innerHTML = "<li>No outings yet</li>";
      return;
    }

    outings.forEach((outing) => {
      const li = document.createElement("li");
      li.textContent = `${outing.title} | ${outing.activity_type} | ${outing.location || "N/A"}`;
      outingsListEl.appendChild(li);
    });
  } catch (err) {
    outingsListEl.innerHTML = "<li>Failed to load outings</li>";
  }
}

/* =========================
   INITIAL LOAD
   ========================= */
loadOutings();
