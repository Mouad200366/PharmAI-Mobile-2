/**
 * Controls the animated agent pipeline on the right side.
 * Maps backend node names to UI agent nodes.
 */

const AGENT_MAP = {
  triage: "triage",
  medical: "medical",
  pharmacy: "pharmacy",
  validator: "validator",
  emergency: "validator", // emergency goes to the same visual slot as validator
};

function resetPipeline() {
  document.querySelectorAll(".agent-node").forEach(node => {
    node.classList.remove("active", "done", "skipped");
  });
  document.querySelectorAll(".agent-connector").forEach(c => {
    c.classList.remove("active");
  });
  document.getElementById("finalStatus").innerHTML = "";
  document.getElementById("finalStatus").classList.add("empty");
}

function markAgentActive(agentKey) {
  // Mark previous active as done
  document.querySelectorAll(".agent-node.active").forEach(node => {
    node.classList.remove("active");
    node.classList.add("done");
  });

  const mapped = AGENT_MAP[agentKey];
  if (!mapped) return;

  const node = document.querySelector(`.agent-node[data-agent="${mapped}"]`);
  if (!node) return;

  node.classList.add("active");

  // Activate connector above this node
  const connector = node.previousElementSibling;
  if (connector && connector.classList.contains("agent-connector")) {
    connector.classList.add("active");
  }
}

function finalizePipeline() {
  document.querySelectorAll(".agent-node.active").forEach(node => {
    node.classList.remove("active");
    node.classList.add("done");
  });
}

function showFinalStatus(status) {
  const statusEl = document.getElementById("finalStatus");
  let cls = "approved";
  let icon = "✓";
  let label = "APPROVED";

  if (status === "EMERGENCY") {
    cls = "emergency";
    icon = "⚠";
    label = "EMERGENCY";
  } else if (status === "REJECTED") {
    cls = "rejected";
    icon = "⚠";
    label = "REJECTED";
  }

  statusEl.classList.remove("empty");
  statusEl.innerHTML = `<div class="status-badge ${cls}">${icon} ${label}</div>`;
}