import urllib.request
import json
import io

data = b'sender_account,receiver_account,amount,timestamp\nA,B,100,2023-01-01T12:00:00Z\n'
boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
body = io.BytesIO()
body.write(b'--' + boundary.encode() + b'\r\n')
body.write(b'Content-Disposition: form-data; name="file"; filename="test.csv"\r\n')
body.write(b'Content-Type: text/csv\r\n\r\n')
body.write(data)
body.write(b'\r\n--' + boundary.encode() + b'--\r\n')

req = urllib.request.Request('http://localhost:8000/api/analyze/public', data=body.getvalue())
req.add_header('Content-type', 'multipart/form-data; boundary=' + boundary)

try:
    resp = urllib.request.urlopen(req)
    print(resp.read().decode())
except urllib.error.URLError as e:
    if hasattr(e, 'read'):
        print('Error:', e.read().decode())
    else:
        print('Error:', e)
