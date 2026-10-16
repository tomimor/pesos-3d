# pesos-3d

Argentine banknotes and coins in 3D. Built with three.js, downloadable as GLB.

**Live:** https://pesos.tomimoreno.com.ar

| Billetes | Monedas y fichas |
| --- | --- |
| [50 pesos · Malvinas](public/billetes/50-pesos/) | [1 peso](public/monedas/1-peso/) |
| [5 pesos](public/billetes/5-pesos/) | [1 peso · alta definición](public/monedas/1-peso-hq/) |
| [1.000.000 de pesos](public/billetes/1000000-pesos/) | [25 centavos · 1994](public/monedas/25-centavos-1994/) |
| [2 pesos · 1888](public/billetes/2-pesos-1888/) | [Primer Token Patrio · 2026](public/monedas/token-patrio-2026/) |
| | [Cospel de subte](public/monedas/cospel-subte/) |
| | [Ficha de teléfono](public/monedas/ficha-telefono/) |

Ready-to-use models live in [`public/modelos/`](public/modelos/): real-world scale in meters, y-up, Draco geometry and WebP textures.

These are digital replicas, not legal tender.

## Layout

```
public/
  billetes/<slug>/   page + textures
  monedas/<slug>/    page (geometry built at runtime from photos)
  monedas/fotos/     coin face photos (see credits)
  lib/               shared viewer (stage.js) and coin builders
  modelos/           exported .glb files
  previews/          gallery thumbnails
scripts/export.mjs   regenerates modelos/ and previews/
```

## Run

No build step. Serve `public/` with any static server:

```sh
npx serve public
```

To regenerate the GLB files and previews after changing a model:

```sh
npm install
npx playwright install chromium
npm run export            # all models
npm run export -- 1-peso  # one model
```

## Credits

Coin and token faces are built from [Numista](https://numista.com) photos, each owned by its author:
[1 peso (N# 2217)](https://en.numista.com/2217),
[25 centavos (N# 2216)](https://en.numista.com/2216),
[Subte token (N# 36075)](https://en.numista.com/36075),
ENTel telephone token. These photos are **not** covered by this repo's licenses.

## License

- Code: [MIT](LICENSE)
- Banknote textures and 3D models, except the Numista photos above: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — Tomás Moreno
