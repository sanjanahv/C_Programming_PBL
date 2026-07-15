#include "reporter.h"
#include <stdio.h>
#include <string.h>

// ANSI color codes
#define ANSI_RED     "\x1b[31m"
#define ANSI_YELLOW  "\x1b[33m"
#define ANSI_GREEN   "\x1b[32m"
#define ANSI_CYAN    "\x1b[36m"
#define ANSI_BOLD    "\x1b[1m"
#define ANSI_RESET   "\x1b[0m"

static const char* severity_label(Severity s) {
    switch (s) {
        case CRITICAL: return "CRITICAL";
        case WARNING:  return "WARNING ";
        default:       return "INFO    ";
    }
}

// Print one violation to a FILE* (terminal or report.txt)
static void print_violation(FILE *out, const ViolationEntry *v, int use_color) {
    const char *col = "";
    const char *rst = "";
    if (use_color) {
        rst = ANSI_RESET;
        switch (v->severity) {
            case CRITICAL: col = ANSI_RED;    break;
            case WARNING:  col = ANSI_YELLOW; break;
            default:       col = ANSI_CYAN;   break;
        }
    }
    fprintf(out, "  %s[%s] %-14s → %s%s\n",
            col, severity_label(v->severity),
            v->field, v->message, rst);
}

void report_results(const ValidationResult *result, const char *report_file) {
    // ── Terminal output (colored) ──────────────────────────────
    printf("\n");
    printf(ANSI_BOLD "╔══════════════════════════════════════════════╗\n" ANSI_RESET);
    printf(ANSI_BOLD "║   littlefs Image Validation Report           ║\n" ANSI_RESET);
    printf(ANSI_BOLD "╚══════════════════════════════════════════════╝\n" ANSI_RESET);

    if (result->count == 0) {
        printf(ANSI_GREEN "  ✓ No violations found.\n" ANSI_RESET);
    } else {
        printf("  Violations found: %d  "
               "(CRITICAL: %d, WARNING: %d, INFO: %d)\n\n",
               result->count, result->critical_count,
               result->warning_count, result->info_count);
        for (int i = 0; i < result->count; i++)
            print_violation(stdout, &result->violations[i], 1);
    }

    // Verdict banner
    printf("\n");
    if (result->critical_count > 0) {
        printf(ANSI_BOLD ANSI_RED
               "  ▶ VERDICT: UNSAFE - DO NOT FLASH\n"
               ANSI_RESET);
    } else if (result->warning_count > 0) {
        printf(ANSI_BOLD ANSI_YELLOW
               "  ▶ VERDICT: CAUTION\n"
               ANSI_RESET);
    } else {
        printf(ANSI_BOLD ANSI_GREEN
               "  ▶ VERDICT: SAFE\n"
               ANSI_RESET);
    }
    printf("\n");

    // ── File output (plain text) ───────────────────────────────
    FILE *f = fopen(report_file, "w");
    if (!f) { perror("[reporter] fopen report"); return; }

    fprintf(f, "littlefs Image Validation Report\n");
    fprintf(f, "=================================\n\n");

    if (result->count == 0) {
        fprintf(f, "  No violations found.\n");
    } else {
        fprintf(f, "  Violations: %d  (CRITICAL: %d, WARNING: %d, INFO: %d)\n\n",
                result->count, result->critical_count,
                result->warning_count, result->info_count);
        for (int i = 0; i < result->count; i++)
            print_violation(f, &result->violations[i], 0);
    }

    fprintf(f, "\nVERDICT: %s\n", result->verdict);
    fclose(f);
    printf("  Report written to %s\n\n", report_file);
}

/* ──────────────────────────────────────────────────────────────────────────
 *  JSON REPORT GENERATOR
 * ──────────────────────────────────────────────────────────────────────── */

static void print_state_json(FILE *f, const char *key, const lfs_superblock_state_t *st) {
    char magic_escaped[64] = {0};
    char *dst = magic_escaped;
    for (int i = 0; i < 8; i++) {
        unsigned char c = (unsigned char)st->magic[i];
        if (c == '"') {
            *dst++ = '\\';
            *dst++ = '"';
        } else if (c == '\\') {
            *dst++ = '\\';
            *dst++ = '\\';
        } else if (c >= 32 && c < 127) {
            *dst++ = c;
        } else {
            dst += sprintf(dst, "\\u00%02x", c);
        }
    }
    *dst = '\0';

    fprintf(f, "      \"%s\": {\n", key);
    fprintf(f, "        \"magic\": \"%s\",\n", magic_escaped);
    fprintf(f, "        \"version\": %u,\n", st->version);
    fprintf(f, "        \"block_size\": %u,\n", st->block_size);
    fprintf(f, "        \"block_count\": %u,\n", st->block_count);
    fprintf(f, "        \"name_max\": %u,\n", st->name_max);
    fprintf(f, "        \"file_max\": %u,\n", st->file_max);
    fprintf(f, "        \"crc\": \"0x%08X\"\n", st->crc);
    fprintf(f, "      }");
}

static void print_validation_json(FILE *f, const ValidationResult *v) {
    fprintf(f, "      \"validation\": {\n");
    fprintf(f, "        \"count\": %d,\n", v->count);
    fprintf(f, "        \"critical_count\": %d,\n", v->critical_count);
    fprintf(f, "        \"warning_count\": %d,\n", v->warning_count);
    fprintf(f, "        \"info_count\": %d,\n", v->info_count);
    fprintf(f, "        \"verdict\": \"%s\",\n", v->verdict);
    fprintf(f, "        \"violations\": [\n");
    for (int i = 0; i < v->count; i++) {
        fprintf(f, "          {\n");
        fprintf(f, "            \"field\": \"%s\",\n", v->violations[i].field);
        fprintf(f, "            \"severity\": %d,\n", v->violations[i].severity);
        
        const char *sev_str = "INFO";
        if (v->violations[i].severity == CRITICAL) sev_str = "CRITICAL";
        else if (v->violations[i].severity == WARNING) sev_str = "WARNING";
        
        fprintf(f, "            \"severity_label\": \"%s\",\n", sev_str);
        fprintf(f, "            \"message\": \"%s\"\n", v->violations[i].message);
        fprintf(f, "          }%s\n", (i + 1 < v->count) ? "," : "");
    }
    fprintf(f, "        ]\n");
    fprintf(f, "      }");
}

void report_results_json(const IterationResult *results, int count, const char *json_file) {
    FILE *f = fopen(json_file, "w");
    if (!f) { perror("[reporter] fopen json report"); return; }

    fprintf(f, "{\n");
    fprintf(f, "  \"total_iterations\": %d,\n", count);
    fprintf(f, "  \"iterations\": [\n");

    for (int i = 0; i < count; i++) {
        const IterationResult *r = &results[i];
        fprintf(f, "    {\n");
        fprintf(f, "      \"iteration\": %d,\n", r->iteration);
        fprintf(f, "      \"corrupted_field\": %d,\n", r->corrupted_field);
        fprintf(f, "      \"corrupted_field_name\": \"%s\",\n", r->corrupted_field_name);
        
        print_state_json(f, "state_before", &r->state_before);
        fprintf(f, ",\n");
        print_state_json(f, "state_fuzzed", &r->state_fuzzed);
        fprintf(f, ",\n");
        print_state_json(f, "state_repaired", &r->state_repaired);
        fprintf(f, ",\n");

        fprintf(f, "      \"repair_magic_applied\": %d,\n", r->repair_magic_applied);
        fprintf(f, "      \"repair_block_size_applied\": %d,\n", r->repair_block_size_applied);
        fprintf(f, "      \"repair_crc_applied\": %d,\n", r->repair_crc_applied);
        
        print_validation_json(f, &r->validation);
        fprintf(f, "\n");
        fprintf(f, "    }%s\n", (i + 1 < count) ? "," : "");
    }

    fprintf(f, "  ]\n");
    fprintf(f, "}\n");
    fclose(f);
    printf("  JSON report written to %s\n\n", json_file);
}
