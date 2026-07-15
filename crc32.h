#ifndef CRC32_H
#define CRC32_H

#include <stdint.h>
#include <stddef.h>

/*
 * CRC32 using reversed polynomial 0xEDB88320
 * (same used by Ethernet, ZIP, PNG, littlefs itself)
 *
 * HOW IT WORKS:
 *   XOR each byte into running CRC; for each of 8 bits:
 *   if LSB=1 → shift right, XOR with poly; else just shift right.
 *   Final XOR with 0xFFFFFFFF gives standard CRC32.
 *
 * MITIGATION: recompute over struct (excl. crc field) and compare
 * with stored value. Mismatch = tampered/corrupted → CRITICAL.
 */
uint32_t crc32(const uint8_t *data, size_t length);

#endif // CRC32_H
