# GitHub

`gh` установлен локально, но нужна авторизация один раз:

```bash
gh auth login
# GitHub.com → HTTPS → Login with browser

cd ~/Documents/Danilovskaya_fish
gh repo create danilovskaya-fish --private --source=. --remote=origin --push
```

Если репозиторий уже создан на сайте:

```bash
git remote add origin https://github.com/<USER>/danilovskaya-fish.git
git push -u origin main
```

CI: `.github/workflows/ci.yml` — pytest backend + сборка админки на push/PR в `main`.
