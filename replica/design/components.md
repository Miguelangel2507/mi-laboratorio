# Componentes

Diseño propio, inspirado en las pautas de interfaz de Apple. No usa colores, iconos, mascota ni textos de Neto. Todo con tokens (`bg-surface`, `text-muted`...), nunca hex. Iconos: Lucide (MIT). Fuente: la del sistema (en iPhone se ve la del sistema de forma nativa), con Inter como respaldo; no se incluye ninguna fuente con licencia.

## Principios
- **Fondo agrupado:** `bg` detrás, bloques `surface` encima con radio `lg`. Listas agrupadas con separadores finos que empiezan tras el icono.
- **Título grande** que se encoge al hacer scroll. Barras superior e inferior translúcidas (`blur-bar`).
- **Zona táctil mínima:** 44 px. Respetar `env(safe-area-inset-*)` (muesca y barra inferior).
- **Modo claro y oscuro** automático, con opción manual. Respetar `prefers-reduced-motion`.
- **Cifras:** `font-variant-numeric: tabular-nums` en todo importe. Ingresos en `income`, gastos en `expense` (texto normal, sin rojo para no agobiar).
- **Todos los textos nuevos, escritos por mí, en español.**

## Componentes

```
TabBar (4 pestañas + botón central)
  items     Inicio, Estadísticas, Cuentas, Cartera; botón + central elevado
  estados   activo (accent + etiqueta), inactivo (text-muted), pulsado (opacidad .6)
  tokens    blur-bar, altura 49 + safe-area, icono 24
  a11y      <nav> con aria-label, aria-current="page", + es <button> con nombre "Añadir movimiento"
  usado en  S04 S05 S06 S08

NavBar / LargeTitle
  variantes título grande, título compacto con botón Atrás, acciones a la derecha
  estados   scroll (se encoge y aparece el blur)
  a11y      <h1> único por pantalla
  usado en  todas

BalanceCard (patrimonio)
  contenido cifra balance 44/700, variación del periodo, subtítulo con la fecha
  estados   normal, oculto (••••• tras mantener pulsado o interruptor), cargando (esqueleto), sin datos
  a11y      al ocultar, aria-label "saldo oculto"; la cifra anuncia importe y moneda
  usado en  S04 S08

GroupedList / ListRow
  variantes fila simple, con icono, con valor a la derecha, con chevron, con acción deslizable (editar, borrar)
  estados   normal, pulsada, deslizada, seleccionada, deshabilitada
  a11y      <ul>/<li>, filas pulsables son <button> o <a>, acciones deslizables también por menú
  usado en  S04 S06 S08 S13-S24

Button
  variantes primary (accent), secondary (surface-2), ghost, danger
  tamaños   md 44, lg 50
  estados   default, pulsado, focus-visible (anillo 2 px accent), deshabilitado, cargando (mantiene etiqueta)
  usado en  S07 S09 S11 S17 S18 S24

AmountInput
  teclado numérico grande, separador decimal según idioma (coma), signo según tipo
  estados   vacío, con valor, error ("Introduce un importe mayor que 0"), moneda distinta
  a11y      inputmode="decimal", label visible, error enlazado con aria-describedby
  usado en  S11 S07 S09

SegmentedControl
  uso       Gasto / Ingreso / Transferencia; Semana / Mes / Año; Meses / Años
  a11y      role="tablist" o radiogroup, flechas del teclado
  usado en  S05 S08 S11

CategoryPicker / AccountPicker
  hoja inferior (bottom sheet) con búsqueda y "+ nueva"
  estados   vacío ("Aún no tienes categorías propias"), seleccionado
  a11y      diálogo modal, foco atrapado, Esc/gesto para cerrar
  usado en  S11 S15

BottomSheet / Modal
  variantes hoja media, hoja completa, alerta de confirmación (destructiva en danger)
  a11y      role="dialog", aria-modal, foco inicial, devuelve el foco al cerrar
  usado en  S11 S12 S24

ProgressBar (presupuestos y metas)
  umbrales  <80 % accent, 80-99 % warning, ≥100 % danger; metas siempre accent
  a11y      role="progressbar" con valor y texto ("72 % del presupuesto")
  usado en  S15 S16

Chart (línea/barras) y Donut
  librería  Recharts con colores de tokens; paleta de categorías de 8 tonos accesibles (a definir en brand)
  a11y      tabla de datos alternativa oculta para lector de pantalla; no depender solo del color
  estados   cargando, sin datos
  usado en  S05 S08

PriceBadge (fondos)
  muestra   VL y fecha del precio ("hace 1 día"), "precio manual" si la hoja no lo da
  estados   actual, antiguo (>3 días, warning), manual, sin conexión (usa caché)
  usado en  S08 S10

Toggle (interruptor), Stepper de periodo, SearchField, EmptyState, Toast, Skeleton
  Toggle    track 51x31, 44 px de zona táctil, role="switch"
  EmptyState ilustración propia sencilla (formas geométricas), un título, una frase y un botón
  Toast     arriba, dura 3 s, role="status", acción "Deshacer"
```

## Estados que toda pantalla debe cubrir
vacío, cargando, con datos, error (con reintento), sin conexión, y datos ocultos.

## Pendiente
- Los primitivos se construyen en `replica-build` al crear `app/` (no hay código aún). Se verán en una ruta `/design`.
- Paleta de 8 colores para categorías y logo/icono de la app: los define `replica-brand`.
- Accent actual (verde azulado) es provisional.
