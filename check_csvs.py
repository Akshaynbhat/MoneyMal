import pandas as pd
import glob

for f in glob.glob('*.csv'):
    try:
        df = pd.read_csv(f)
        cols = df.columns.tolist()
        if 'sender_id' in cols and 'receiver_id' in cols:
            print(f, len(pd.concat([df['sender_id'], df['receiver_id']]).unique()))
        elif 'sender_account' in cols and 'receiver_account' in cols:
            print(f, len(pd.concat([df['sender_account'], df['receiver_account']]).unique()))
        elif 'sender_ac' in cols and 'receiver_ac' in cols:
             print(f, len(pd.concat([df['sender_ac'], df['receiver_ac']]).unique()))
    except Exception as e:
        pass
