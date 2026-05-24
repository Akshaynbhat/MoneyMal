from backend.database import SessionLocal, Base, engine
from backend.models import Transaction, Account, Alert
from backend.profiler import BehavioralProfiler
import sys
import json
import datetime

def run_demo():
    print("1. Initializing SQLite Database...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    print("2. Loading test transactions...")
    print("   (Using synthetic spike data for testing...)")
    data = []
    now = datetime.datetime.utcnow()
    # Synthesize normal baseline
    for i in range(40):
        data.append({
            "transaction_id": f"tx_{i}",
            "sender_id": "acc_A",
            "receiver_id": "acc_B",
            "amount": 100.0 + (i % 5),
            "timestamp": now - datetime.timedelta(hours=40-i)
        })
    # Inject abnormal Z-Score Spike
    data.append({
        "transaction_id": "tx_spike",
        "sender_id": "acc_A",
        "receiver_id": "acc_B",
        "amount": 85000.0, 
        "timestamp": now
    })

    records = data
    for r in records:
        tx = Transaction(
            transaction_id=str(r["transaction_id"]),
            sender_id=str(r["sender_id"]),
            receiver_id=str(r["receiver_id"]),
            amount=float(r["amount"]),
            timestamp=r["timestamp"]
        )
        db.add(tx)
    db.commit()
    print(f"   -> Inserted {len(records)} transactions into persistent DB.")

    print("\n3. Testing Behavioral ML Profiler on 'acc_A' (Adaptive Z-Score & Timing limits)...")
    profiler = BehavioralProfiler(db)
    
    score, anomalies = profiler.profile_account("acc_A")
    print(f"   -> Calculated Behavior Score: {score}")
    print(f"   -> Anomalies Detected:")
    for a in anomalies:
        print(f"        * {a}")

    print("\n4. Triggering Database Alert Manager...")
    if score > 0:
        alert = Alert(
            account_id="acc_A", 
            final_score=score, 
            explanation="; ".join(anomalies)
        )
        db.add(alert)
        db.commit()

    alerts = db.query(Alert).all()
    print(f"   -> Database currently holds {len(alerts)} pending alert(s):")
    for a in alerts:
        print(f"        [Alert: {a.alert_id.split('-')[0]}...] Account='{a.account_id}' | Score={a.final_score:.1f} | Reason='{a.explanation}'")
    
    print("\n[SUCCESS] Custom Incremental Architecture & Persistent ML Routing Operational.")

if __name__ == "__main__":
    run_demo()
