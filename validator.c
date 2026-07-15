#include "validator.h"
#include "crc32.h"
#include <stdio.h>
#include <string.h>

/* Helper: add a violation to the result */
static void add_violation(ValidationResult *r, const char *field,
                           Severity sev, const char *msg) {
    if (r->count >= MAX_VIOLATIONS) return;
    ViolationEntry *v = &r->violations[r->count++];
    strncpy(v->field,   field, sizeof(v->field)   - 1);
    strncpy(v->message, msg,   sizeof(v->message) - 1);
    v->severity = sev;
    if (sev == CRITICAL) r->critical_count++;
    else if (sev == WARNING) r->warning_count++;
    else                     r->info_count++;
}

/* Power-of-2 check — the core bit-trick */
static int is_power_of_2(uint32_t n) {
    return (n != 0) && ((n & (n - 1)) == 0);
}

int validate_image(const char *filename, ValidationResult *result) {
    memset(result, 0, sizeof(ValidationResult));

    // ── Read the binary image ──────────────────────────────────
    lfs_superblock_t sb;
    FILE *f = fopen(filename, "rb");
    if (!f) {
        perror("[validator] fopen failed");
        return -1;
    }
    fread(&sb, sizeof(sb), 1, f);
    fclose(f);

    // ── CHECK 1: Magic string ──────────────────────────────────
    if (memcmp(sb.magic, "littlefs", 8) != 0) {
        add_violation(result, "magic", CRITICAL,
            "Magic is not 'littlefs' — image is unrecognizable");
    }

    // ── CHECK 2: Version ──────────────────────────────────────
    if (sb.version != 0x00020000) {
        char msg[128];
        snprintf(msg, sizeof(msg),
            "Unknown version 0x%08X (expected 0x00020000)", sb.version);
        add_violation(result, "version", WARNING, msg);
    }

    // ── CHECK 3: Block size — must be power of 2, ≥ 128, ≤ 65536 ─
    if (!is_power_of_2(sb.block_size)) {
        char msg[128];
        snprintf(msg, sizeof(msg),
            "block_size=%u is not a power of 2", sb.block_size);
        add_violation(result, "block_size", CRITICAL, msg);
    } else if (sb.block_size < 128 || sb.block_size > 65536) {
        char msg[128];
        snprintf(msg, sizeof(msg),
            "block_size=%u out of acceptable range [128, 65536]", sb.block_size);
        add_violation(result, "block_size", WARNING, msg);
    }

    // ── CHECK 4: Block count ──────────────────────────────────
    if (sb.block_count < 2 || sb.block_count > 65536) {
        char msg[128];
        snprintf(msg, sizeof(msg),
            "block_count=%u out of range [2, 65536]", sb.block_count);
        add_violation(result, "block_count", CRITICAL, msg);
    }

    // ── CHECK 5: Name max ─────────────────────────────────────
    if (sb.name_max == 0) {
        add_violation(result, "name_max", WARNING,
            "name_max=0 means no filenames allowed");
    }

    // ── CHECK 6: CRC32 integrity ──────────────────────────────
    size_t   data_len  = sizeof(lfs_superblock_t) - sizeof(uint32_t);
    uint32_t fresh_crc = crc32((uint8_t *)&sb, data_len);
    if (fresh_crc != sb.crc) {
        char msg[128];
        snprintf(msg, sizeof(msg),
            "CRC mismatch: stored=0x%08X, computed=0x%08X — image tampered",
            sb.crc, fresh_crc);
        add_violation(result, "crc", CRITICAL, msg);
    }

    // ── VERDICT ───────────────────────────────────────────────
    if (result->critical_count > 0)
        strncpy(result->verdict, "UNSAFE - DO NOT FLASH", sizeof(result->verdict) - 1);
    else if (result->warning_count > 0)
        strncpy(result->verdict, "CAUTION", sizeof(result->verdict) - 1);
    else
        strncpy(result->verdict, "SAFE", sizeof(result->verdict) - 1);

    return 0;
}
