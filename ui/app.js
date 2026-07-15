/* ═══════════════════════════════════════════════════════════════════════════
   lfs-fuzzer-bench — app.js
   Manages report uploading, timeline steppers, superblock struct comparisons,
   telemetry details, and safety violations.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

let gReport = null;
let gActiveIteration = 1;

/* ── Tab switching ──────────────────────────────────────────────────────── */
document.getElementById('mainTabs').addEventListener('click', function (e) {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  const target = btn.dataset.tab;

  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === target);
    t.setAttribute('aria-selected', t.dataset.tab === target);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'panel-' + target);
  });
});

/* ── File Upload ────────────────────────────────────────────────────────── */
document.getElementById('fileInput').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (ev) {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.iterations || !Array.isArray(data.iterations)) {
        alert('Invalid report format: "iterations" array not found.');
        return;
      }
      loadReport(data, file.name);
    } catch (err) {
      alert('Failed to parse JSON file: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // reset
});

/* ── Load Report ────────────────────────────────────────────────────────── */
function loadReport(data, filename) {
  gReport = data;
  gActiveIteration = 1;

  // Show badge
  const badge = document.getElementById('reportBadge');
  badge.style.display = 'flex';
  document.getElementById('reportName').textContent = filename || 'report.json';

  // Toggle sections
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('fuzzContent').style.display = 'block';

  // Generate stepper timeline
  renderStepper();

  // Load first iteration
  selectIteration(gActiveIteration);
}

/* ── Stepper Generation ─────────────────────────────────────────────────── */
function renderStepper() {
  const container = document.getElementById('timelineStepper');
  if (!gReport || !gReport.iterations) return;

  container.innerHTML = gReport.iterations.map(it => {
    const verdict = it.validation.verdict || 'SAFE';
    return `<div class="step-node" data-iter="${it.iteration}" data-verdict="${verdict}">
      ${it.iteration}
    </div>`;
  }).join('');

  // Click handler
  container.querySelectorAll('.step-node').forEach(node => {
    node.addEventListener('click', function () {
      gActiveIteration = parseInt(node.dataset.iter, 10);
      selectIteration(gActiveIteration);
    });
  });
}

/* ── Select Iteration ───────────────────────────────────────────────────── */
function selectIteration(iterNum) {
  if (!gReport || !gReport.iterations) return;

  // Update active state in stepper
  document.querySelectorAll('.step-node').forEach(node => {
    node.classList.toggle('active', parseInt(node.dataset.iter, 10) === iterNum);
  });

  const iterData = gReport.iterations.find(it => it.iteration === iterNum);
  if (!iterData) return;

  // 1. Verdict
  const verdictBadge = document.getElementById('iterVerdict');
  const verdictCard = document.getElementById('verdictCard');
  const verdictSummary = document.getElementById('verdictSummary');
  const verdict = iterData.validation.verdict || 'SAFE';

  verdictBadge.textContent = verdict;
  
  // reset classes
  verdictBadge.className = 'verdict-badge';
  verdictCard.className = 'card verdict-card';

  if (verdict === 'SAFE') {
    verdictBadge.classList.add('v-safe');
    verdictCard.classList.add('v-safe');
    verdictSummary.innerHTML = '✓ Superblock is fully valid and meets all littlefs structural limits. Safe to flash.';
  } else if (verdict === 'CAUTION') {
    verdictBadge.classList.add('v-caution');
    verdictCard.classList.add('v-caution');
    verdictSummary.innerHTML = '⚠️ Warnings detected. The superblock is structurally stable, but disk metadata contains unexpected format parameters (e.g. invalid version).';
  } else {
    verdictBadge.classList.add('v-unsafe');
    verdictCard.classList.add('v-unsafe');
    verdictSummary.innerHTML = '❌ Superblock has critical unresolved safety violations. Flash programming would cause boot crash or directory mount failure.';
  }

  // 2. Telemetry log
  const teleLog = document.getElementById('telemetryLog');
  const repairMagic = iterData.repair_magic_applied ? 'ACTIVE (Magic healed)' : 'INACTIVE';
  const repairBlock = iterData.repair_block_size_applied ? 'ACTIVE (Snapped to nearest power of 2)' : 'INACTIVE';
  const repairCrc = iterData.repair_crc_applied ? 'ACTIVE (Recomputed CRC-32)' : 'INACTIVE';

  teleLog.innerHTML = `
    <div class="telemetry-item">
      <span class="telemetry-lbl">Fuzzed Mutation Field</span>
      <span class="telemetry-val text-bad" style="font-weight:700">${iterData.corrupted_field_name.toUpperCase()}</span>
    </div>
    <div class="telemetry-item">
      <span class="telemetry-lbl">Magic Byte Healing</span>
      <span class="telemetry-badge ${iterData.repair_magic_applied ? 'active' : 'inactive'}">${repairMagic}</span>
    </div>
    <div class="telemetry-item">
      <span class="telemetry-lbl">Block Size Snap-to-Power-of-2</span>
      <span class="telemetry-badge ${iterData.repair_block_size_applied ? 'active' : 'inactive'}">${repairBlock}</span>
    </div>
    <div class="telemetry-item">
      <span class="telemetry-lbl">CRC Correction</span>
      <span class="telemetry-badge ${iterData.repair_crc_applied ? 'active' : 'inactive'}">${repairCrc}</span>
    </div>
  `;

  // 3. Violations
  const violationsCard = document.getElementById('violationsCard');
  const violationsList = document.getElementById('violationsList');
  const violations = iterData.validation.violations || [];

  if (violations.length > 0) {
    violationsCard.style.display = 'block';
    violationsList.innerHTML = violations.map(v => {
      const sevClass = v.severity === 2 ? 'v-critical' : v.severity === 1 ? 'v-warning' : '';
      return `<div class="violation-row ${sevClass}">
        <div class="violation-row-hdr">
          <span class="violation-field">${v.field}</span>
          <span class="violation-sev">${v.severity_label}</span>
        </div>
        <div class="violation-msg">${v.message}</div>
      </div>`;
    }).join('');
  } else {
    violationsCard.style.display = 'none';
  }

  // 4. Superblock comparison
  renderSuperblockColumn('fieldsBefore', iterData.state_before);
  renderSuperblockColumn('fieldsFuzzed', iterData.state_fuzzed, iterData.state_before);
  renderSuperblockColumn('fieldsRepaired', iterData.state_repaired, iterData.state_fuzzed, iterData.state_before);
}

/* ── Render Superblock Field Grid ───────────────────────────────────────── */
function renderSuperblockColumn(elemId, current, compareFuzzed = null, compareBefore = null) {
  const container = document.getElementById(elemId);
  
  const fields = [
    { key: 'magic', label: 'magic' },
    { key: 'version', label: 'version' },
    { key: 'block_size', label: 'block_size' },
    { key: 'block_count', label: 'block_count' },
    { key: 'name_max', label: 'name_max' },
    { key: 'file_max', label: 'file_max' },
    { key: 'crc', label: 'crc' },
  ];

  container.innerHTML = fields.map(f => {
    let rowClass = 'comp-field-row';
    const val = current[f.key];
    let displayVal = val;

    // formatting
    if (f.key === 'magic') {
      displayVal = `"${val}"`;
    }

    // highlight changes
    if (compareBefore && !compareFuzzed) {
      // we are in the fuzzed column, compare against baseline (compareBefore)
      if (current[f.key] !== compareBefore[f.key]) {
        rowClass += ' mutated';
      }
    } else if (compareFuzzed && compareBefore) {
      // we are in the repaired column, check if fuzzed was mutated, and if repaired changed it
      const wasMutated = compareFuzzed[f.key] !== compareBefore[f.key];
      const wasRepaired = current[f.key] !== compareFuzzed[f.key];
      
      if (wasRepaired) {
        rowClass += ' repaired-field';
      } else if (wasMutated) {
        // mutated but not repaired (e.g. version)
        rowClass += ' mutated';
      }
    }

    return `<div class="${rowClass}">
      <span class="comp-field-lbl">${f.label}</span>
      <span class="comp-field-val">${displayVal}</span>
    </div>`;
  }).join('');
}

/* ── Check for report.json on page load ─────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  // Try to load embedded report.json if present
  fetch('report.json')
    .then(r => r.json())
    .then(data => {
      loadReport(data, 'report.json');
    })
    .catch(() => {
      // no report.json, wait for manual upload
    });
});
