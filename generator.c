#include "generator.h"
#include "crc32.h"
#include <stdio.h>
#include <string.h>

int generate_image(lfs_superblock_t *sb, const char *filename) {
    // ── Step 1: Fill valid fields ──────────────────────────────
    memcpy(sb->magic,      "littlefs", 8);
    sb->version     = 0x00020000;   // littlefs v2.0
    sb->block_size  = 4096;         // 4 KB blocks (power of 2 ✓)
    sb->block_count = 128;          // 128 blocks → 512 KB image
    sb->name_max    = 255;
    sb->file_max    = 2147483647;   // INT32_MAX

    // ── Step 2: Compute CRC32 over everything EXCEPT crc field ─
    //    We treat the struct as a byte array; crc is the last 4 bytes
    size_t data_len = sizeof(lfs_superblock_t) - sizeof(uint32_t);
    sb->crc = crc32((uint8_t *)sb, data_len);

    // ── Step 3: Write to binary file ───────────────────────────
    FILE *f = fopen(filename, "wb");
    if (!f) {
        perror("[generator] fopen failed");
        return -1;
    }
    fwrite(sb, sizeof(lfs_superblock_t), 1, f);
    fclose(f);

    printf("[generator] Valid image written to %s  (CRC=0x%08X)\n",
           filename, sb->crc);
    return 0;
}
