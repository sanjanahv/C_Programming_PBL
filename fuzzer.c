#include "fuzzer.h"
#include "crc32.h"
#include "validator.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* ──────────────────────────────────────────────────────────────────────────
 *  MITIGATION ALGORITHM 1 — Magic Byte Healing
 * ──────────────────────────────────────────────────────────────────────── */
static int repair_magic(lfs_superblock_t *sb) {
    if (memcmp(sb->magic, "littlefs", 8) != 0) {
        printf("  [MITIGATION] Magic corrupted → restored to 'littlefs'\n");
        memcpy(sb->magic, "littlefs", 8);
        return 1; // repaired
    }
    return 0;
}

/* ──────────────────────────────────────────────────────────────────────────
 *  MITIGATION ALGORITHM 2 — Block Size Snap-to-Power-of-2
 * ──────────────────────────────────────────────────────────────────────── */
static int repair_block_size(lfs_superblock_t *sb) {
    uint32_t n = sb->block_size;
    if (n == 0 || (n & (n - 1)) != 0) {
        uint32_t valid = 512; // minimum sane block size
        while (valid < n) valid <<= 1;
        printf("  [MITIGATION] block_size %u → snapped to %u (next power of 2)\n",
               sb->block_size, valid);
        sb->block_size = valid;
        return 1; // repaired
    }
    return 0;
}

/* ──────────────────────────────────────────────────────────────────────────
 *  MITIGATION ALGORITHM 3 — CRC Recomputation & Correction
 * ──────────────────────────────────────────────────────────────────────── */
static int repair_crc(lfs_superblock_t *sb) {
    size_t   data_len   = sizeof(lfs_superblock_t) - sizeof(uint32_t);
    uint32_t fresh_crc  = crc32((uint8_t *)sb, data_len);
    if (fresh_crc != sb->crc) {
        printf("  [MITIGATION] CRC mismatch (stored=0x%08X, computed=0x%08X) → recomputed\n",
               sb->crc, fresh_crc);
        sb->crc = fresh_crc;
        return 1; // repaired
    }
    return 0;
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Helper: Capture superblock state to telemetry structure
 * ──────────────────────────────────────────────────────────────────────── */
static void capture_state(lfs_superblock_state_t *state, const lfs_superblock_t *sb) {
    memcpy(state->magic, sb->magic, 8);
    state->magic[8] = '\0'; // ensure null termination for printing
    state->version = sb->version;
    state->block_size = sb->block_size;
    state->block_count = sb->block_count;
    state->name_max = sb->name_max;
    state->file_max = sb->file_max;
    state->crc = sb->crc;
}

/* ──────────────────────────────────────────────────────────────────────────
 *  MAIN FUZZER
 * ──────────────────────────────────────────────────────────────────────── */
void fuzz_image(const char *src_file, const char *dst_file, IterationResult *results) {
    srand((unsigned)time(NULL));

    for (int iter = 0; iter < FUZZ_ITERATIONS; iter++) {
        results[iter].iteration = iter + 1;

        // 1. Read clean baseline image into struct
        lfs_superblock_t sb;
        FILE *f = fopen(src_file, "rb");
        if (!f) { perror("[fuzzer] fopen src"); return; }
        fread(&sb, sizeof(sb), 1, f);
        fclose(f);

        // Capture state before fuzzing
        capture_state(&results[iter].state_before, &sb);

        // 2. Pick a random field to corrupt (0-5)
        int target = rand() % 6;
        results[iter].corrupted_field = target;
        printf("\n[fuzzer] Iteration %d — corrupting field %d\n", iter + 1, target);

        switch (target) {
            case 0:
                strcpy(results[iter].corrupted_field_name, "magic");
                sb.magic[rand() % 8] = (char)(rand() % 256);
                printf("  [FUZZ] magic corrupted\n");
                break;
            case 1:
                strcpy(results[iter].corrupted_field_name, "version");
                sb.version = 0xDEADBEEF;
                printf("  [FUZZ] version = 0xDEADBEEF\n");
                break;
            case 2:
                strcpy(results[iter].corrupted_field_name, "block_size");
                sb.block_size = (rand() % 5000) + 1;
                while (sb.block_size != 0 && (sb.block_size & (sb.block_size - 1)) == 0)
                    sb.block_size++;
                printf("  [FUZZ] block_size = %u (not power of 2)\n", sb.block_size);
                break;
            case 3:
                strcpy(results[iter].corrupted_field_name, "block_count");
                sb.block_count = 0;
                printf("  [FUZZ] block_count = 0 (invalid)\n");
                break;
            case 4:
                strcpy(results[iter].corrupted_field_name, "name_max");
                sb.name_max = 0;
                printf("  [FUZZ] name_max = 0 (invalid)\n");
                break;
            case 5:
                strcpy(results[iter].corrupted_field_name, "crc");
                sb.crc = ~sb.crc;
                printf("  [FUZZ] crc flipped to 0x%08X\n", sb.crc);
                break;
        }

        // Capture state after fuzzing but before repairs
        capture_state(&results[iter].state_fuzzed, &sb);

        // 3. Run mitigation repairs
        results[iter].repair_magic_applied = repair_magic(&sb);
        results[iter].repair_block_size_applied = repair_block_size(&sb);
        results[iter].repair_crc_applied = repair_crc(&sb);

        // Capture state after repairs
        capture_state(&results[iter].state_repaired, &sb);

        // 4. Write this iteration's fuzzed image to its own file
        char iter_filename[64];
        snprintf(iter_filename, sizeof(iter_filename), "fuzzed_iter_%d.bin", iter + 1);
        FILE *out = fopen(iter_filename, "wb");
        if (!out) { perror("[fuzzer] fopen dst iter"); return; }
        fwrite(&sb, sizeof(sb), 1, out);
        fclose(out);

        // 5. Run validation on this iteration's image to capture post-mitigation safety
        validate_image(iter_filename, &results[iter].validation);

        // 6. Write final iteration to the main destination file too
        if (iter == FUZZ_ITERATIONS - 1) {
            FILE *fout = fopen(dst_file, "wb");
            if (fout) {
                fwrite(&sb, sizeof(sb), 1, fout);
                fclose(fout);
            }
        }
    }
}
