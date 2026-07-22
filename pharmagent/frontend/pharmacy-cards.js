/**
 * Renders pharmacy options as cards inside the chat bubble.
 * Falls back to the text summary if no structured options are available.
 */
function renderPharmacyCards(pharmacyOptions, pharmacySummary) {
  // pharmacy_options is a dict { medicine: [list of pharmacies] }
  if (!pharmacyOptions || Object.keys(pharmacyOptions).length === 0) {
    if (pharmacySummary) {
      return `<div class="pharmacy-summary-text">🏥 ${escapeText(pharmacySummary)}</div>`;
    }
    return "";
  }

  // Collect all unique pharmacies across all medicines
  const seen = new Set();
  const allPharmacies = [];

  Object.entries(pharmacyOptions).forEach(([medicine, options]) => {
    if (!Array.isArray(options)) return;
    options.forEach(p => {
      const key = p.id || p.name;
      if (seen.has(key)) return;
      seen.add(key);
      allPharmacies.push({ ...p, medicine });
    });
  });

  if (allPharmacies.length === 0) {
    return pharmacySummary ? `<div class="pharmacy-summary-text">🏥 ${escapeText(pharmacySummary)}</div>` : "";
  }

  // Sort by distance
  allPharmacies.sort((a, b) => (a.distance_km || 99) - (b.distance_km || 99));

  let html = `<div class="pharmacy-cards">`;
  allPharmacies.slice(0, 3).forEach((p, idx) => {
    const topClass = idx === 0 ? "top" : "";
    const nightBadge = p.is_night_shift
      ? `<span class="pharmacy-night-badge">🌙 NIGHT</span>`
      : "";
    const price = p.price ? `${p.price.toFixed(2)} MAD` : "";
    const distance = p.distance_km ? `${p.distance_km} km` : "";

    html += `
      <div class="pharmacy-card ${topClass}">
        <div class="pharmacy-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        <div class="pharmacy-info">
          <div class="pharmacy-name">${escapeText(p.pharmacy_name || p.name)}</div>
          <div class="pharmacy-details">
            ${distance ? `<span class="pharmacy-detail">📍 ${distance}</span>` : ""}
            ${p.medicine ? `<span class="pharmacy-detail">💊 ${escapeText(p.medicine)}</span>` : ""}
            ${nightBadge}
          </div>
        </div>
        ${price ? `<div class="pharmacy-price">${price}</div>` : ""}
      </div>
    `;
  });
  html += `</div>`;

  return html;
}

function escapeText(t) {
  if (!t) return "";
  return String(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}