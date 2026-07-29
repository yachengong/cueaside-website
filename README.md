# CueAside website

The public, static product site for CueAside, a macOS live speaking copilot
for interviews and meetings. It does not require an OpenAI or ChatGPT login.

## Local development

```bash
npm install
npm run dev
```

## Build and validate

```bash
npm test
```

`npm run build` exports the complete site to `out/`.

## Publishing

Push `main` to GitHub. The Pages workflow builds the static export and
publishes it publicly. The custom domain is `cueaside.com`.
