# DeporTV

Plugin de Kino: partidos de fútbol y otros deportes en vivo, agrupados por liga, en la pestaña En vivo.

- **Agenda:** la lista de partidos de El Canal Deportivo (hora, liga, equipos y canales).
- **Reproducción:** de la página de cada canal sigue los iframes hasta el reproductor `xstream.st` y toma el stream HLS de su lista `streamUrls`. Otros reproductores aún no se entienden y el canal avisa que no tiene señal.
- **Hosts:** `elcanaldeportivo.org` y `xstream.st`. El stream puede venir de otros hosts, por eso `liveStreamHosts` es `any` (se aprueba en rojo al instalar).
- Sin cuenta ni DRM. Las retransmisiones no tienen licencia y dependen de dominios que cambian: la responsabilidad es de quien instala el plugin.

## Estado

0.1.0, sin probar en un aparato. Falta verificar la cadena de iframes y el stream en Kino.

## Pruebas

```bash
node sdk/validate.mjs .
node --test test/plugin.test.mjs
```
