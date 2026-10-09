# ADR-0004: Referencias cruzadas a figuras y tablas

- **Estado:** aceptado (09/10/2026). El usuario eligió la sintaxis.
- **Hito:** H3.5

## Contexto

GFM no tiene sintaxis para etiquetar figuras ni tablas, ni para referenciarlas. `pandoc-crossref` no está instalado y su versión debe coincidir exactamente con la de Pandoc. Las alternativas presentadas al usuario fueron:

- la convención de pandoc-crossref;
- la etiqueta en el título de la imagen;
- comentarios HTML.

El usuario eligió la convención de **pandoc-crossref**.

## Decisión

Sintaxis:

```markdown
![Resultados del ensayo](assets/plot.png){#fig:resultados}

Table: Ventas por mes {#tbl:ventas}

| Mes | Ventas |
| --- | -----: |
| Ene |    120 |

Como muestra la [@fig:resultados] y resume la [@tbl:ventas].
```

- **Etiquetas:** `{#fig:…}` justo detrás de una imagen que está sola en su párrafo. `Table: leyenda {#tbl:…}` en el párrafo inmediatamente anterior o posterior a la tabla. Sin etiqueta, `Table: …` pone una leyenda sin número.
- **Referencias:** `[@fig:…]` y `[@tbl:…]`, la misma forma que las citas (ADR-0003). Varias seguidas, `[@fig:a; @fig:b]`, dan «figuras 1 y 2».
- **Implementación:** el filtro `resources/pandoc/filters/crossref.lua` se ejecuta después de `citations.lua` y antes de `--citeproc`. Numera en orden de aparición y sustituye las citas cuyas claves son todas `fig:`/`tbl:`. Las demás quedan para citeproc.
- **Idioma:** según `lang` del front matter. Con `es` usa «Figura 1:» en la leyenda y «figura 1» en el texto; en otro caso, «Figure 1:» y «Figure 1».
- **Salida LaTeX** (PDF vía LaTeX y .tex): numera LaTeX, con `\caption` y `\label`, y las referencias son `figura~\ref{…}`. En español, el filtro renombra «Cuadro» a «Tabla» mediante `header-includes`. Las plantillas LaTeX propias deben incluir `$header-includes$`, como la plantilla por defecto de Pandoc.
- **Resto de formatos:** el número se escribe en la leyenda y la referencia es un enlace interno.
- **Word:**
  - Pandoc 3.1.3 no crea marcador de destino para el ID de una figura, así que la figura va dentro de un `Div` con ese ID.
  - Los nombres de marcador se normalizan a las reglas de Word (letra inicial; letras, dígitos y `_`; máximo 40 caracteres): `fig:resultados` pasa a `fig_resultados`, actualizando los enlaces.
  - El linter comprueba que cada enlace interno tiene su marcador.

## Consecuencias y limitaciones

- En GitHub y otros visores GFM, `{#fig:…}` y `Table: …` se ven como texto. Es la contrapartida aceptada de la convención estándar.
- En el editor, las etiquetas son texto normal y las referencias se muestran como citas.
- En Word los números son texto fijo, no campos `SEQ`: si se reordenan figuras en Word, no se renumeran. Hay que volver a exportar desde MarcDoc.
- Una referencia a una etiqueta inexistente sale como `??`, sin enlace, con un aviso en la exportación.
- Solo se numeran figuras y tablas de primer nivel y las que están dentro de citas, `div` o listas. No se numeran ecuaciones ni secciones.
