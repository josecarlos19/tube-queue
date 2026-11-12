<p align="center">
  <img src="public/logo.svg" alt="TubeQueue" width="96" height="96">
</p>

<h1 align="center">TubeQueue</h1>

<p align="center"><strong>Your YouTube channels, newest first. No algorithm.</strong></p>

<br>

<p align="center">A self-hosted, private feed of the channels you pick.</p>

<p align="center">
  <a href="README.pt-BR.md">🇧🇷 Português</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="LICENSE">MIT License</a>
</p>

---

## Features

- 📺 **One chronological feed** of the channels you add, in grid or list view
- ▶️ **Built-in player**, with a link to YouTube for likes and comments
- ✅ **Watch tracking** and a **history** you can filter by date
- 🔎 **Instant search** across videos and channels
- 📥 **CSV import/export** of your channel list
- 🌗 **Light and dark themes**, in English and Brazilian Portuguese
- 🔒 **Private**: no Google login, everything stays in one local SQLite file

## Quick start

**Docker**

```sh
git clone https://github.com/josecarlos19/tube-queue.git tubequeue && cd tubequeue
cp .env.example .env
docker compose up -d --build
```

**Node.js** (version pinned in `.nvmrc`)

```sh
git clone https://github.com/josecarlos19/tube-queue.git tubequeue && cd tubequeue
nvm install
npm start
```

Open **<http://127.0.0.1:8070>**. Save your API key in **Settings**, click **Add channel** and paste a channel's `@handle` or URL.

## YouTube API key

TubeQueue reads public channel data through the YouTube Data API. The key is free:

1. In the [Google Cloud Console](https://console.cloud.google.com/), enable **YouTube Data API v3**.
2. Create an **API key** under **APIs & Services → Credentials** and restrict it to that API.
3. Paste it in **Settings**, or set `YOUTUBE_API_KEY` in `.env`.

The free [daily quota](https://developers.google.com/youtube/v3/getting-started#quota) is more than enough for a personal feed.

## Good to know

- **No login.** TubeQueue listens on `127.0.0.1` only. To reach it from other devices, put it behind a reverse proxy with authentication.
- **Backups.** All your data lives in `data/`. Stop the app and copy that folder.
- **Updates.** Run `git pull`, then restart the app (or rebuild the container).

TubeQueue is not affiliated with YouTube or Google.

## License

[MIT](LICENSE)
