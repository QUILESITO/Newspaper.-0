# Newspaper 2.0

Noticias en español con barra de sesgo, artículos propios contrastados con las fuentes y avisos por ntfy. Coste cero: GitHub Pages + GitHub Actions + GitHub Models.

## Subirlo
1. Descomprime el zip y sube TODO (incluida la carpeta oculta `.github`) al repositorio: *Add file → Upload files → Commit changes*. Sustituye a tu `News.yml` anterior.
2. *Settings → Pages → Source: GitHub Actions* (el repositorio debe ser público).
3. *Settings → Secrets and variables → Actions → Variables*: `NTFY_TOPIC` con tu texto secreto (ya lo tenías). Suscríbete al mismo texto en la app ntfy.
4. *Actions → News → Run workflow*. En 1-2 minutos la web está en `https://quilesito.github.io/Newspaper--/`.

## Cómo funciona
- Cada 10 min el workflow ejecuta las pruebas, lee los RSS de `feeds.json`, agrupa titulares del mismo hecho, calcula el reparto de sesgo y publica `data/news.json`.
- **Artículos**: para las 10 noticias más cubiertas de cada ejecución, GitHub Models (`openai/gpt-4o-mini`, con el `GITHUB_TOKEN` del workflow, sin claves que guardar) redacta una síntesis. Cada afirmación debe citar fuentes por número; si una cita no existe en las fuentes recuperadas, se descarta. Si falla la IA o se agota la cuota, la noticia muestra un resumen básico etiquetado como tal. Los artículos ya generados se reutilizan mientras no cambien las fuentes.
- **Importante**: la IA solo ve titulares y resúmenes del RSS, no los artículos completos (no se saltan muros de pago ni se copian textos).
- **Sesgo**: un voto por medio; centro-izquierda cuenta como izquierda y centro-derecha como derecha; sin clasificar se muestra aparte; con menos de 3 medios clasificados no se da porcentaje. Las etiquetas de `feeds.json` son aproximadas: contrástalas y ajústalas.
- **Fútbol**: solo sale si lo cubren ≥4 medios; ≥2 si es de España/LaLiga; ≥3 si es un fichaje. Se descartan categorías juveniles.
- **Descartar noticias**: desliza a la derecha (o pulsa ×). Se guarda 7 días en tu dispositivo, con «Deshacer» y «Restaurar».
- **Avisos**: noticias nuevas con ≥3 medios (máximo 3 por ejecución, sin repetir) y resumen a las 08:00 de Madrid con las 3 de mayor puntuación en las últimas 10 h (puntuación = nº de medios + 2 si hay agencia). La primera ejecución no envía avisos.

## Sin comprobar todavía
RSS reales (algunas URL pueden haber cambiado: la web avisa de las que fallen), IA, ntfy y el aspecto en tu navegador. Las 5 pruebas automáticas (sesgo, agrupación, fútbol, categorías, sin claves en `public/`) sí pasan.
Pendiente: búsqueda, filtro por medio, SEO y avisos push propios.
Límites: las noticias duran 48 h; si un RSS cambia, edita `feeds.json`; GitHub pausa tareas programadas tras 60 días sin actividad (pulsa Run workflow).
