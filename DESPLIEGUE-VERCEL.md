# Despliegue en Vercel (el editor que consume SkyNet)

El upstream publica en **Cloudflare Pages** (`pnpm deploy` → `wrangler`). Este camino es **además,
no en vez de**: SkyNet incrusta el editor y necesita una dirección estable bajo el control de
Invent.

> Las razones de abajo vivían dentro de `vercel.json` como una clave `"//"`. **No se puede:** el
> esquema de Vercel rechaza propiedades adicionales y el despliegue falla con
> `should NOT have additional property "//"`. Un JSON de configuración no admite comentarios, así
> que la explicación vive acá.

## Por qué se construye desde la RAÍZ y no con `apps/web` como raíz

Es un monorepo pnpm. Si se apunta Vercel a `apps/web` como *root directory*, el install no ve el
workspace y **los paquetes de `packages/` no resuelven**. Por eso:

```
buildCommand:    pnpm --filter @openreel/web build
installCommand:  pnpm install --no-frozen-lockfile
outputDirectory: apps/web/dist
```

`--no-frozen-lockfile` porque el lockfile del upstream se mueve y un fork no siempre va al día;
en un editor que se despliega aparte, fallar el install por eso cuesta más de lo que protege.

## Por qué NO hay cabeceras COOP/COEP

Harían falta para `SharedArrayBuffer` (que usa `@ffmpeg/core-mt`), pero la superficie que SkyNet
usa es **el traspaso por iframe**, y COEP cambia las reglas de lo que se puede incrustar. Añadirlas
sin medir su efecto sobre el iframe es meter un riesgo en el camino que sí se usa para ganar uno
que hoy no se ejercita. Cuando la exportación con hilos haga falta, entra con su propia
comprobación.

## La variable que no puede faltar

`VITE_SKYNET_ORIGENES` — lista separada por comas de los orígenes autorizados a mandar traspasos.
**No hay comodín, a propósito** (`origenPermitido` en `contrato.ts`): sin esta variable el editor
rechaza a todo el mundo, y con un comodín cualquier página que consiga incrustarlo podría
reemplazar el proyecto abierto y hacerle bajar una URL que ella elija.

Se lee en tiempo de CONSTRUCCIÓN (es `VITE_`), así que cambiarla exige volver a desplegar.

El valor de producción se declara con orígenes completos, nunca dominios parciales:

```text
https://skynet.codigoenigma.com,http://localhost:3000
```

Una preview de SkyNet no entra por parecido de dominio: se agrega su origen exacto durante la
prueba coordinada y se retira después. El contrato v2 comprueba además que el mensaje venga de
`window.parent`; un origen permitido por sí solo no alcanza.

## Del otro lado

SkyNet apunta acá con `NEXT_PUBLIC_EDITOR_VIDEO_URL`. Sin ella su panel lo dice y no manda nada.
El contrato productivo vive en `apps/web/src/integrations/skynet/contratoV2.ts` y su gemelo
`src/lib/estudio/contratoOpenReel.ts` en SkyNet. El contrato v1 se conserva solo para enlaces
internos viejos: el producto usa v2 con alcance, revisión, correlación, autosave y render.
