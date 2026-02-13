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
