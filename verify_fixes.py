"""
Verification script for MoneyMal fixes.
Run this against ibm_aml_15k_upload.csv + ibm_aml_15k_groundtruth.csv

Usage:
    python verify_fixes.py

Targets:
    Precision >= 53%
    Recall >= 48%
    Runtime < 20s
"""
import pandas as pd
import sys
import time
sys.path.insert(0, '.')
from backend.engine import ForensicsEngine

df_up = pd.read_csv('ibm_aml_15k_upload.csv')
df_gt = pd.read_csv('ibm_aml_15k_groundtruth.csv')

print(f"Upload: {len(df_up)} rows | Ground truth: {len(df_gt)} rows")

t0 = time.time()
eng = ForensicsEngine()
eng.load_data(df_up)
result = eng.run_all()
elapsed = time.time() - t0

accs = result['suspicious_accounts']
rings = result['fraud_rings']
flagged = {a['account_id'] for a in accs}

# Build fraud account set from ground truth
fraud_accs = (
    set(df_gt[df_gt['is_fraud'] == True]['sender_id'].astype(str)) |
    set(df_gt[df_gt['is_fraud'] == True]['receiver_id'].astype(str))
)
total = len(set(df_gt['sender_id'].astype(str)) | set(df_gt['receiver_id'].astype(str)))

TP = len(flagged & fraud_accs)
FP = len(flagged - fraud_accs)
FN = len(fraud_accs - flagged)
P = TP / (TP + FP) if (TP + FP) > 0 else 0
R = TP / (TP + FN) if (TP + FN) > 0 else 0
F1 = 2 * P * R / (P + R) if (P + R) > 0 else 0

ring_types = {}
for r in rings:
    ring_types[r['pattern_type']] = ring_types.get(r['pattern_type'], 0) + 1

block_count = sum(1 for a in accs if a['verdict'] == 'BLOCK')
review_count = sum(1 for a in accs if a['verdict'] == 'REVIEW')

print(f"\n{'='*50}")
print(f"  VERIFICATION RESULTS")
print(f"{'='*50}")
print(f"  Time     : {elapsed:.1f}s")
print(f"  Rings    : {len(rings)} {ring_types}")
print(f"  Flagged  : {len(accs)} (BLOCK={block_count}, REVIEW={review_count})")
print(f"  Precision: {P:.1%}")
print(f"  Recall   : {R:.1%}")
print(f"  F1 Score : {F1:.1%}")
print(f"{'='*50}\n")

# Gate checks
failures = []
if elapsed >= 20:
    failures.append(f"FAIL: too slow ({elapsed:.1f}s >= 20s)")
if P < 0.53:
    failures.append(f"FAIL: precision regressed ({P:.1%} < 53%)")
if R < 0.48:
    failures.append(f"FAIL: recall regressed ({R:.1%} < 48%)")

if failures:
    for f in failures:
        print(f)
    sys.exit(1)
else:
    print("ALL GATES PASS ✓")
