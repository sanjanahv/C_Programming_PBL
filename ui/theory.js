/* ═══════════════════════════════════════════════════════════════════════════
   lfs-fuzzer-bench — theory.js
   Integrity Theory page content loader
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  const HTML = `
<h1>⚡ Superblock Integrity & Automatic Repairs</h1>
<p>The superblock is the most critical block of the filesystem. It is written at block index 0 (and duplicated at block 1) and contains the core configuration parameters that allow littlefs to locate and mount the entire disk. If the superblock is corrupted, the filesystem is completely unmountable, and all data on the flash device is lost.</p>

<h2>The littlefs Superblock Structure</h2>
<p>In binary memory, the superblock consists of a packed structure containing exactly 7 fields. Our validator checks each field against the official littlefs specification constraints:</p>
<ul>
  <li><strong>magic (8 bytes):</strong> Must be exactly the string <code>"littlefs"</code>. If even one character is wrong, mounting fails immediately because the block is not recognized as a valid filesystem.</li>
  <li><strong>version (32-bit uint):</strong> Specifies the littlefs disk format version (normally <code>0x00020000</code> for v2.0). A warning is raised if the version is unrecognized, as newer disk structures could lead to unexpected behavior.</li>
  <li><strong>block_size (32-bit uint):</strong> Must be a power of 2 (e.g. 512, 1024, 2048, 4096) and range between 128 and 65536 bytes. Flash sectors are physically divided into powers of 2.</li>
  <li><strong>block_count (32-bit uint):</strong> The total physical blocks on the device. Valid range is 2 to 65536 blocks. An invalid count (like 0) is critical as it corrupts all allocation maps.</li>
  <li><strong>name_max (32-bit uint):</strong> Maximum length of filenames in directory structures (default 255). Must be greater than 0.</li>
  <li><strong>file_max (32-bit uint):</strong> Maximum file size supported (default 2147483647).</li>
  <li><strong>crc (32-bit uint):</strong> CRC-32 checksum computed over all the previous fields. LittleFS validates this CRC on boot; a mismatch is treated as a critical block corruption.</li>
</ul>

<h2>Fuzzing Mutations</h2>
<p>Our fuzzer simulates hardware corruption (such as bit rot in flash memory or a power drop during a superblock update) by introducing mutations directly into one of the 7 fields:</p>
<ol>
  <li><strong>Magic corruption:</strong> Random bytes are injected into the <code>"littlefs"</code> string.</li>
  <li><strong>Version mutation:</strong> Version field is set to an invalid value (<code>0xDEADBEEF</code>).</li>
  <li><strong>Block size corruption:</strong> Block size is mutated to a non-power-of-2 integer.</li>
  <li><strong>Block count corruption:</strong> Block count is wiped to 0.</li>
  <li><strong>Name max corruption:</strong> Wiped to 0, leaving no room for files.</li>
  <li><strong>CRC corruption:</strong> Bit-wise inversion of the CRC-32 checksum.</li>
</ol>

<h2>Self-Healing Mitigations</h2>
<p>To demonstrate software-based fault tolerance and safety-critical auto-healing, our fuzzer implements three mitigation algorithms that run right after a mutation occurs:</p>

<blockquote>
  <strong>1. Magic Byte Healing</strong><br>
  If the magic bytes are modified but other structures are intact, the program heals the magic string by restoring <code>"littlefs"</code>. This recovers the signature.
</blockquote>

<blockquote>
  <strong>2. Block Size Snapping</strong><br>
  If the fuzzed block size is not a power of 2, the mitigation engine rounds it up to the next valid power of 2 (e.g., 2968 is rounded up to 4096). This matches physical flash block boundaries.
</blockquote>

<blockquote>
  <strong>3. CRC Recomputation</strong><br>
  If repairs were made or fields were modified, the checksum is recomputed. The new CRC-32 value is written into the superblock, making it internally consistent for flashing.
</blockquote>

<h2>Final verdicts</h2>
<ul>
  <li><span style="color:var(--ok);font-weight:600">SAFE:</span> Superblock is structurally valid and meets all littlefs constraints. No violations found.</li>
  <li><span style="color:var(--warn);font-weight:600">CAUTION:</span> Warnings were detected (such as an unrecognized version number) but the superblock is structurally stable and will not fail critical read/write operations.</li>
  <li><span style="color:var(--bad);font-weight:600">UNSAFE - DO NOT FLASH:</span> Critical validation failures remained (such as block size or block count at 0) which would immediately crash the device if written.</li>
</ul>
`;

  document.addEventListener('DOMContentLoaded', function () {
    const el = document.getElementById('theoryBody');
    if (el) el.innerHTML = HTML;
  });
})();
