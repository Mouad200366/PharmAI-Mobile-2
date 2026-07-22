const API_URL_STREAM = "http://127.0.0.1:8000/assist-stream";

document.getElementById("userInput").addEventListener("keydown", function(e) {
  if (e.key === "Enter") sendMessage();
});

async function sendMessage() {
  const input = document.getElementById("userInput");
  const sendBtn = document.getElementById("sendBtn");
  const hasPrescription = document.getElementById("hasPrescription").checked;
  const query = input.value.trim();

  if (!query) return;

  appendMessage("user", query);
  input.value = "";
  sendBtn.disabled = true;
  resetPipeline();
  const loadingId = appendLoading();

  try {
    const response = await fetch(API_URL_STREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_query: query,
        has_prescription: hasPrescription,
        user_lat: 33.5731,
        user_lng: -7.5898
      })
    });

    if (!response.ok) throw new Error("Server error: " + response.status);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Server-Sent Events are separated by \n\n
      const parts = buffer.split("\n\n");
      buffer = parts.pop(); // keep incomplete chunk

      for (const part of parts) {
        const line = part.replace(/^data:\s*/, "").trim();
        if (!line) continue;

        try {
          const payload = JSON.parse(line);

          if (payload.type === "agent_step") {
            markAgentActive(payload.agent);
          } else if (payload.type === "final") {
            finalData = payload;
            finalizePipeline();
            showFinalStatus(payload.status);
          } else if (payload.type === "error") {
            throw new Error(payload.error);
          }
        } catch (err) {
          console.warn("Skipping malformed SSE line:", line);
        }
      }
    }

    removeLoading(loadingId);
    if (finalData) {
      renderResponse(finalData);
    } else {
      appendMessage("assistant", "Hmm, no response received. Please try again.");
    }

  } catch (err) {
    console.error(err);
    removeLoading(loadingId);
    appendMessage("assistant", "⚠️ Could not reach the Pharmagent server. Make sure it is running.");
  }

  sendBtn.disabled = false;
  input.focus();
}

function renderResponse(data) {
  const status = data.status;
  let cssClass = "assistant";

  if (status === "EMERGENCY") cssClass = "emergency";
  else if (status === "REJECTED") cssClass = "rejected";

  let html = `<div class="bubble">`;
  html += renderMarkdown(data.final_answer);

  if (status === "APPROVED") {
    html += renderPharmacyCards(data.pharmacy_options, data.pharmacy_summary);
  }

  if (data.warnings && data.warnings.length > 0) {
    html += `<div class="warnings"><strong>⚠️ Important Warnings</strong>`;
    html += data.warnings.map(w => "• " + escapeHtml(w)).join("<br>");
    html += `</div>`;
  }

  if (data.citations && data.citations.length > 0) {
    html += `<div class="citations"><strong>📚 Sources</strong><br>`;
    data.citations.forEach(c => {
      html += `<span class="citation-tag">${escapeHtml(c)}</span>`;
    });
    html += `</div>`;
  }

  html += `</div>`;

  const messagesDiv = document.getElementById("chatMessages");
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${cssClass}`;
  msgDiv.innerHTML = html;
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendMessage(role, text) {
  const messagesDiv = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendLoading() {
  const messagesDiv = document.getElementById("chatMessages");
  const id = "loading-" + Date.now();
  const div = document.createElement("div");
  div.className = "message assistant";
  div.id = id;
  div.innerHTML = `
    <div class="bubble">
      <em>Agents are working</em>
      <span class="loading-dots"><span></span><span></span><span></span></span>
    </div>`;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  return id;
}

function removeLoading(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}