/* ═══════════════════════════════════════════════════════════════════════════
   avalanche.js — CRC32 Avalanche Effect Simulator
   Implements CRC-32 (IEEE 802.3 polynomial) fully in JS, performs a 1-bit
   flip on the input bytes, and visualises how many output bits changed.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* ── CRC-32 table (standard IEEE 802.3 / Ethernet polynomial 0xEDB88320) ── */
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;  // ensure unsigned
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function strToBytes(s) {
  return new TextEncoder().encode(s);
}

function toHex(n) {
  return '0x' + n.toString(16).toUpperCase().padStart(8, '0');
}

function toBin32(n) {
  return n.toString(2).padStart(32, '0');
}

function countDifferentBits(a, b) {
  let x = (a ^ b) >>> 0;
  let count = 0;
  while (x) { count += x & 1; x >>>= 1; }
  return count;
}

/* ── State ───────────────────────────────────────────────────────────────── */
let avOriginalBytes = null;     // Uint8Array of original input
let avFlippedBytes  = null;     // Uint8Array after one bit flip
let avOriginalCRC   = null;
let avFlippedCRC    = null;
let avFlipApplied   = false;

/* ── DOM refs ────────────────────────────────────────────────────────────── */
const avInput       = document.getElementById('avInput');
const avByteSelect  = document.getElementById('avByteSelect');
const avBitSelect   = document.getElementById('avBitSelect');
const avFlipBtn     = document.getElementById('avFlipBtn');
const avResetBtn    = document.getElementById('avResetBtn');
const avByteRow     = document.getElementById('avByteRow');
const avCrcOriginal = document.getElementById('avCrcOriginal');
const avCrcFlipped  = document.getElementById('avCrcFlipped');
const avCrcOrigBin  = document.getElementById('avCrcOriginalBin');
const avCrcFlipBin  = document.getElementById('avCrcFlippedBin');
const avMeterCard   = document.getElementById('avMeterCard');
const avMeterBar    = document.getElementById('avMeterBar');
const avMeterStat   = document.getElementById('avMeterStat');
const avMeterCaption= document.getElementById('avMeterCaption');
const avBitgridCard = document.getElementById('avBitgridCard');
const avBitGrid     = document.getElementById('avBitGrid');
const avFlippedInfo = document.getElementById('avFlippedInfo');

/* ── Refresh byte selector dropdown ─────────────────────────────────────── */
function refreshByteSelect(bytes) {
  avByteSelect.innerHTML = '';
  bytes.forEach((b, i) => {
    const opt = document.createElement('option');
    const ch = b >= 32 && b < 127 ? String.fromCharCode(b) : '.';
    opt.value = i;
    opt.textContent = `Byte ${i} ('${ch}' = 0x${b.toString(16).toUpperCase().padStart(2,'0')})`;
    avByteSelect.appendChild(opt);
  });
}

/* ── Refresh the byte hex strip below the textarea ──────────────────────── */
function refreshByteRow(bytes, flippedBytes, flipByteIdx) {
  avByteRow.innerHTML = bytes.map((b, i) => {
    const hex = b.toString(16).toUpperCase().padStart(2, '0');
    const isFlipped = (flippedBytes && i === flipByteIdx);
    const flippedHex = isFlipped ? flippedBytes[i].toString(16).toUpperCase().padStart(2, '0') : null;
    if (isFlipped) {
      return `<span class="av-byte av-byte-flipped" title="Byte ${i} changed: 0x${hex} → 0x${flippedHex}">
        <s class="av-byte-old">${hex}</s>
        <span class="av-byte-new">${flippedHex}</span>
      </span>`;
    }
    return `<span class="av-byte" title="Byte ${i}: 0x${hex} = '${b >= 32 && b < 127 ? String.fromCharCode(b) : '.'}'">
      ${hex}
    </span>`;
  }).join('');
}

/* ── Compute and display original CRC from current textarea input ────────── */
function computeOriginal() {
  avOriginalBytes = strToBytes(avInput.value || '');
  avOriginalCRC   = crc32(avOriginalBytes);
  avFlippedBytes  = null;
  avFlippedCRC    = null;
  avFlipApplied   = false;

  avCrcOriginal.textContent = toHex(avOriginalCRC);
  avCrcFlipped.textContent  = '—';
  avCrcOrigBin.textContent  = toBin32(avOriginalCRC);
  avCrcFlipBin.textContent  = '';

  avMeterCard.style.display   = 'none';
  avBitgridCard.style.display = 'none';
  avFlippedInfo.style.display = 'none';

  refreshByteSelect(avOriginalBytes);
  refreshByteRow(avOriginalBytes, null, -1);
}

/* ── Perform the bit flip and update all visuals ─────────────────────────── */
function performFlip() {
  if (!avOriginalBytes || avOriginalBytes.length === 0) {
    computeOriginal();
  }

  const byteIdx = parseInt(avByteSelect.value, 10);
  const bitIdx  = parseInt(avBitSelect.value,  10);

  // Clone bytes and flip the selected bit
  avFlippedBytes = new Uint8Array(avOriginalBytes);
  avFlippedBytes[byteIdx] ^= (1 << bitIdx);
  avFlippedCRC = crc32(avFlippedBytes);
  avFlipApplied = true;

  // CRC display
  avCrcOriginal.textContent = toHex(avOriginalCRC);
  avCrcFlipped.textContent  = toHex(avFlippedCRC);
  avCrcOrigBin.textContent  = toBin32(avOriginalCRC);
  avCrcFlipBin.textContent  = toBin32(avFlippedCRC);

  // Byte strip
  refreshByteRow(avOriginalBytes, avFlippedBytes, byteIdx);

  // Flip info
  const origByte    = avOriginalBytes[byteIdx];
  const flippedByte = avFlippedBytes[byteIdx];
  avFlippedInfo.style.display = 'block';
  avFlippedInfo.innerHTML =
    `Flipped bit ${bitIdx} of byte ${byteIdx}: ` +
    `<code>0x${origByte.toString(16).toUpperCase().padStart(2,'0')}</code> ` +
    `→ <code>0x${flippedByte.toString(16).toUpperCase().padStart(2,'0')}</code>`;

  // Avalanche meter
  const diffBits = countDifferentBits(avOriginalCRC, avFlippedCRC);
  const pct      = ((diffBits / 32) * 100).toFixed(1);

  avMeterCard.style.display   = 'block';
  avBitgridCard.style.display = 'block';

  avMeterStat.textContent = `${diffBits} / 32 bits changed  (${pct}%)`;

  // colour the bar: red if < 25%, amber if 25-40%, green if > 40%
  avMeterBar.style.width = pct + '%';
  avMeterBar.className = 'av-meter-bar';
  if (diffBits === 0) {
    avMeterBar.classList.add('bar-zero');
    avMeterCaption.textContent = '⚠️  Zero bits changed — the bit-flip had no effect on the CRC. This is extremely rare and means this particular input pattern is a blind spot. Try a different input.';
  } else if (diffBits < 8) {
    avMeterBar.classList.add('bar-low');
    avMeterCaption.textContent = `Only ${diffBits} bits changed — weaker than ideal, but the CRC would still detect this corruption.`;
  } else if (diffBits < 14) {
    avMeterBar.classList.add('bar-mid');
    avMeterCaption.textContent = `${diffBits} bits changed — decent avalanche. The corrupted superblock would be caught by CRC validation.`;
  } else {
    avMeterBar.classList.add('bar-strong');
    avMeterCaption.textContent = `${diffBits} bits changed (${pct}%) — strong avalanche effect! This 1-bit input change caused nearly half the CRC output bits to flip. Corruption detection is virtually guaranteed.`;
  }

  // 32-bit diff grid
  renderBitGrid(avOriginalCRC, avFlippedCRC);
}

/* ── Render the 32-cell bit comparison grid ─────────────────────────────── */
function renderBitGrid(origCRC, flippedCRC) {
  const origBin    = toBin32(origCRC);
  const flippedBin = toBin32(flippedCRC);
  const xorBin     = toBin32((origCRC ^ flippedCRC) >>> 0);

  avBitGrid.innerHTML = '';
  for (let i = 0; i < 32; i++) {
    const changed = xorBin[i] === '1';
    const cell = document.createElement('div');
    cell.className = 'av-bitcell ' + (changed ? 'bit-flipped' : 'bit-same');
    cell.title = `Bit ${31 - i}: orig=${origBin[i]}, flipped=${flippedBin[i]}`;
    cell.innerHTML = `
      <span class="bc-pos">${31 - i}</span>
      <span class="bc-orig">${origBin[i]}</span>
      <span class="bc-arrow">${changed ? '↕' : '='}</span>
      <span class="bc-new">${flippedBin[i]}</span>
    `;
    avBitGrid.appendChild(cell);
  }
}

/* ── Reset ───────────────────────────────────────────────────────────────── */
function avReset() {
  avFlippedBytes  = null;
  avFlippedCRC    = null;
  avFlipApplied   = false;

  avCrcFlipped.textContent  = '—';
  avCrcFlipBin.textContent  = '';
  avMeterCard.style.display   = 'none';
  avBitgridCard.style.display = 'none';
  avFlippedInfo.style.display = 'none';
  refreshByteRow(avOriginalBytes, null, -1);
  // re-render original CRC (unchanged, just ensure display)
  avCrcOriginal.textContent = toHex(avOriginalCRC);
  avCrcOrigBin.textContent  = toBin32(avOriginalCRC);
}

/* ── Event wiring ────────────────────────────────────────────────────────── */
avInput.addEventListener('input', computeOriginal);
avFlipBtn.addEventListener('click', performFlip);
avResetBtn.addEventListener('click', avReset);

// Update byte dropdown description when byte selection changes
avByteSelect.addEventListener('change', () => {
  if (avFlipApplied) avReset();
});

/* ── Boot: compute from default value ────────────────────────────────────── */
computeOriginal();
