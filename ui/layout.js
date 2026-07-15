/* ═══════════════════════════════════════════════════════════════════════════
   layout.js — Superblock Binary Layout Simulator
   Manages interactive highlighting and details display for the 32-byte
   superblock structure.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const FIELD_DETAILS = {
  magic: {
    name: 'magic',
    type: 'char[8]',
    range: '0 - 7',
    size: '8 bytes',
    hex: '6C 69 74 74 6C 65 66 73',
    parsed: '"littlefs"',
    desc: 'The unique identification string for the file system. When mounting, the littlefs driver checks these first 8 bytes. If they do not match "littlefs" exactly, the mount operation fails instantly. This prevents the OS from attempting to read a corrupted or foreign filesystem partition.'
  },
  version: {
    name: 'version',
    type: 'uint32_t',
    range: '8 - 11',
    size: '4 bytes',
    hex: '00 00 02 00',
    parsed: '0x00020000 (Version 2.0)',
    desc: 'Represents the littlefs version format. Version 2.0 is stored as 0x00020000. In memory, it is written in little-endian order (least-significant byte first), which is why you see 00 00 02 00 in the binary hex layout.'
  },
  block_size: {
    name: 'block_size',
    type: 'uint32_t',
    range: '12 - 15',
    size: '4 bytes',
    hex: '00 10 00 00',
    parsed: '4096 bytes',
    desc: 'The logical size of each block in flash memory. It must be a power of 2 (e.g. 512, 1024, 2048, 4096) and fall between 128 and 65536 bytes. The fuzzer targets this field by setting it to non-power-of-2 values (like 1999) to simulate write corruption.'
  },
  block_count: {
    name: 'block_count',
    type: 'uint32_t',
    range: '16 - 19',
    size: '4 bytes',
    hex: '00 02 00 00',
    parsed: '512 blocks (2.0 MB)',
    desc: 'The total number of logical blocks available on the flash storage device. Combined with the block size, this determines the total storage capacity of the partition. Out-of-bounds block counts cause allocator failures.'
  },
  name_max: {
    name: 'name_max',
    type: 'uint32_t',
    range: '20 - 23',
    size: '4 bytes',
    hex: 'FF 00 00 00',
    parsed: '255 characters',
    desc: 'The maximum allowable length for a filename string inside directory structures. Defining this value in the superblock prevents buffer overflows by ensuring the driver allocates adequate memory for directory path lists.'
  },
  file_max: {
    name: 'file_max',
    type: 'uint32_t',
    range: '24 - 27',
    size: '4 bytes',
    hex: 'FF FF FF 7F',
    parsed: '2,147,483,647 bytes (2.0 GB)',
    desc: 'The maximum allowable file size in bytes. In this configuration, it is set to the maximum positive value of a signed 32-bit integer (0x7FFFFFFF), allowing files up to 2 GB.'
  },
  crc: {
    name: 'crc',
    type: 'uint32_t',
    range: '28 - 31',
    size: '4 bytes',
    hex: '0F C8 27 A9',
    parsed: '0xA927C80F',
    desc: 'The cyclic redundancy check (CRC-32) checksum calculated over bytes 0 through 27 (the first 28 bytes of the superblock). If a single bit in the superblock changes due to storage fatigue or crash errors, the computed CRC will no longer match this value, revealing the damage immediately.'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const detailCard       = document.getElementById('layoutDetailCard');
  const placeholderText  = document.getElementById('detailPlaceholder');
  const detailContent    = document.getElementById('detailContent');
  
  const fieldNameEl      = document.getElementById('detailFieldName');
  const typeEl           = document.getElementById('detailType');
  const rangeEl          = document.getElementById('detailRange');
  const sizeEl           = document.getElementById('detailSize');
  const hexEl            = document.getElementById('detailHex');
  const parsedEl         = document.getElementById('detailParsed');
  const descEl           = document.getElementById('detailDesc');

  function showFieldDetails(fieldId) {
    const details = FIELD_DETAILS[fieldId];
    if (!details) return;

    placeholderText.style.display = 'none';
    detailContent.style.display = 'block';

    fieldNameEl.textContent = details.name;
    typeEl.textContent      = details.type;
    rangeEl.textContent     = details.range;
    sizeEl.textContent      = details.size;
    hexEl.textContent       = details.hex;
    parsedEl.textContent    = details.parsed;
    descEl.textContent      = details.desc;

    // Remove active highlight from all elements
    document.querySelectorAll('.hex-byte, .ascii-char, .layout-btn').forEach(el => {
      el.classList.remove('active-field-highlight');
    });

    // Highlight matching bytes in hex visualizer
    document.querySelectorAll(`[data-field="${fieldId}"]`).forEach(el => {
      el.classList.add('active-field-highlight');
    });

    // Highlight button
    const btn = document.querySelector(`.btn-${fieldId}`);
    if (btn) btn.classList.add('active-field-highlight');
  }

  // Wire hover and click events for hex-bytes
  document.querySelectorAll('.hex-byte, .ascii-char').forEach(el => {
    const fieldId = el.getAttribute('data-field');
    
    el.addEventListener('mouseenter', () => {
      showFieldDetails(fieldId);
    });

    el.addEventListener('click', () => {
      showFieldDetails(fieldId);
    });
  });

  // Wire click events for bottom buttons
  document.querySelectorAll('.layout-btn').forEach(btn => {
    const fieldId = btn.getAttribute('data-field');
    btn.addEventListener('click', () => {
      showFieldDetails(fieldId);
    });
    btn.addEventListener('mouseenter', () => {
      showFieldDetails(fieldId);
    });
  });

  // Show "magic" by default on load
  showFieldDetails('magic');
});
