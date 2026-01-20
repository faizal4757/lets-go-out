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
    loadOutings();
  } catch (err) {
    messageEl.textContent = err.message;
  }
});

/* =========================
   LOAD & DISPLAY OUTINGS (AP-3 + AP-4)
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

      const text = document.createElement("span");
      text.textContent = `${outing.title} | ${outing.activity_type} | ${outing.location || "N/A"}`;

      const button = document.createElement("button");
      button.textContent = "I'm interested";
      button.style.marginLeft = "10px";

      button.addEventListener("click", async () => {
        try {
          await expressInterest(outing.id);
          alert("Interest sent!");
        } catch (err) {
          alert(err.message);
        }
      });

      li.appendChild(text);
      li.appendChild(button);
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
