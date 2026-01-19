// Entry point for frontend logic
console.log("Frontend MVP loaded");

const form = document.getElementById("create-outing-form");
const messageEl = document.getElementById("message");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    title: document.getElementById("title").value,
    activity_type: document.getElementById("type").value, // ✅ correct field name
    date_time: document.getElementById("date_time").value,
    location: document.getElementById("location").value
  };

  try {
    await createOuting(payload);
    messageEl.textContent = "Outing created successfully";
    form.reset();
  } catch (err) {
    messageEl.textContent = err.message;
  }
});
