"""Serve this demo locally. Use --lan to let a tablet on the same Wi-Fi connect."""
import argparse
import functools
import http.server
from pathlib import Path
import socket

parser = argparse.ArgumentParser(description='Quick Draw demo local server')
parser.add_argument('--lan', action='store_true', help='Allow devices on the local network')
parser.add_argument('--port', type=int, default=8765)
args = parser.parse_args()
root = Path(__file__).resolve().parent
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
host = '0.0.0.0' if args.lan else '127.0.0.1'
print(f'Computer: http://127.0.0.1:{args.port}', flush=True)
if args.lan:
    for ip in sorted({item[4][0] for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)}):
        if not ip.startswith('127.'):
            print(f'Tablet (same Wi-Fi): http://{ip}:{args.port}', flush=True)
print('Press Ctrl+C to stop. Only this demo folder is served.', flush=True)
with http.server.ThreadingHTTPServer((host, args.port), handler) as server:
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
