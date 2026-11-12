<p align="center">
  <img src="public/logo.svg" alt="TubeQueue" width="96" height="96">
</p>

<h1 align="center">TubeQueue</h1>

<p align="center"><strong>Seus canais do YouTube, dos mais recentes aos mais antigos. Sem algoritmo.</strong></p>

<br>

<p align="center">Um feed privado e auto-hospedado dos canais que você escolher.</p>

<p align="center">
  <a href="README.md">🇺🇸 English</a> ·
  <a href="#comece-rápido">Comece rápido</a> ·
  <a href="LICENSE">Licença MIT</a>
</p>

---

## Recursos

- 📺 **Um feed cronológico** dos canais que você adicionar, em grade ou lista
- ▶️ **Player integrado**, com link para o YouTube para curtir e comentar
- ✅ **Marcação de vídeos vistos** e **histórico** com filtro por data
- 🔎 **Busca instantânea** em vídeos e canais
- 📥 **Importação e exportação** da lista de canais em CSV
- 🌗 **Temas claro e escuro**, em português e inglês
- 🔒 **Privado**: sem login do Google, tudo fica em um arquivo SQLite local

## Comece rápido

**Docker**

```sh
git clone <url-do-repositorio> tubequeue && cd tubequeue
cp .env.example .env
docker compose up -d --build
```

**Node.js** (versão fixada no `.nvmrc`)

```sh
git clone <url-do-repositorio> tubequeue && cd tubequeue
nvm install
npm start
```

Abra **<http://127.0.0.1:8070>**. Salve sua chave da API em **Configurações**, clique em **Adicionar canal** e cole o `@handle` ou a URL de um canal.

## Chave da API do YouTube

O TubeQueue lê dados públicos dos canais pela YouTube Data API. A chave é gratuita:

1. No [Google Cloud Console](https://console.cloud.google.com/), ative a **YouTube Data API v3**.
2. Crie uma **chave de API** em **APIs e serviços → Credenciais** e restrinja-a a essa API.
3. Cole a chave em **Configurações** ou defina `YOUTUBE_API_KEY` no `.env`.

A [cota diária gratuita](https://developers.google.com/youtube/v3/getting-started#quota) é mais do que suficiente para um feed pessoal.

## Bom saber

- **Sem login.** O TubeQueue escuta apenas em `127.0.0.1`. Para acessar de outros dispositivos, use um proxy reverso com autenticação.
- **Backup.** Todos os seus dados ficam em `data/`. Pare o app e copie essa pasta.
- **Atualização.** Rode `git pull` e reinicie o app (ou reconstrua o container).

O TubeQueue não tem vínculo com o YouTube nem com o Google.

## Licença

[MIT](LICENSE)
