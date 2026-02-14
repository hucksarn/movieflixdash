# MovieFlix Dashboard

## Quick Start (Single Command)

Run everything (dashboard + Telegram bot) from the project folder:

```bash
bash run.sh
```

This will:
1. Install dependencies if needed
2. Start the dashboard on `PORT` (default `5173`)
3. Start the Telegram bot

Logs:
- `dev.log`
- `telegram-bot.log`

Open:
```
http://<server-ip>:5173/emby/
```

## Production Server (Port 5002)

Start the production server in the background:

```bash
cd ~/movieflixdash
nohup env PORT=5002 node /home/alee20300/movieflixdash/server/app.js > /tmp/movieflix-app.log 2>&1 </dev/null &
disown
```

Stop the production server:

```bash
pkill -f "/home/alee20300/movieflixdash/server/app.js"
```

Check status/logs:

```bash
tail -n 50 /tmp/movieflix-app.log
```

## Cloudflare Tunnel (Background)

Ensure the tunnel config points to the local server:

```
~/.cloudflared/config.yml
```

Example:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/alee20300/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: movieflixhd.cloud
    service: http://127.0.0.1:5002
  - service: http_status:404
```

Start the tunnel in the background:

```bash
nohup ~/bin/cloudflared tunnel run movieflix > /tmp/cloudflared.log 2>&1 &
```

Stop the tunnel:

```bash
pkill -f "cloudflared tunnel run"
```

Check tunnel logs:

```bash
tail -n 50 /tmp/cloudflared.log
```

## Stop Everything

Stops only the processes started by `run.sh` (no other Vite instances):

```bash
bash stop.sh
```

### Change Port / Host

```bash
PORT=5180 HOST=0.0.0.0 bash run.sh
```

## Requirements

- Node.js (18+ recommended)
- npm (comes with Node.js)

## Notes

- Run from your home folder (no sudo required).
- The Vite dev server is used because it provides the built-in `/api/*` endpoints.
