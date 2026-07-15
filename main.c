#include <stdio.h>
#include "superblock.h"
#include "generator.h"
#include "fuzzer.h"
#include "validator.h"
#include "reporter.h"

int main(void) {
    printf("===========================================\n");
    printf("  littlefs Image Fuzzer & Vulnerability Detector\n");
    printf("===========================================\n\n");

    lfs_superblock_t sb;

    // ── PHASE 1: Generate a valid baseline image ───────────────
    printf("[ PHASE 1 ] Generating valid image.bin ...\n");
    if (generate_image(&sb, "image.bin") < 0) return 1;

    // ── PHASE 2: Validate the clean image first ────────────────
    printf("\n[ PHASE 2 ] Validating clean image.bin ...\n");
    ValidationResult clean_result;
    validate_image("image.bin", &clean_result);
    printf("  Clean image verdict: %s\n", clean_result.verdict);

    // ── PHASE 3: Fuzz + auto-repair across 8 iterations ───────
    printf("\n[ PHASE 3 ] Fuzzing image → fuzzed_image.bin ...\n");
    IterationResult results[FUZZ_ITERATIONS];
    fuzz_image("image.bin", "fuzzed_image.bin", results);

    // ── PHASE 4: Validate the last fuzzed image ────────────────
    printf("\n[ PHASE 4 ] Validating final fuzzed_image.bin ...\n");
    ValidationResult fuzz_result;
    validate_image("fuzzed_image.bin", &fuzz_result);

    // ── PHASE 5: Report ────────────────────────────────────────
    printf("\n[ PHASE 5 ] Generating text and JSON reports ...\n");
    report_results(&fuzz_result, "report.txt");
    report_results_json(results, FUZZ_ITERATIONS, "report.json");
    report_results_json(results, FUZZ_ITERATIONS, "ui/report.json");

    return 0;
}
