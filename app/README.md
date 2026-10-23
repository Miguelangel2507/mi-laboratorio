# Mi Patrimonio (PWA)

App de finanzas personales que se guarda solo en tu dispositivo (IndexedDB).

```bash
npm install
npm run dev       # desarrollo
npm test          # tests unitarios
npm run build     # producción en dist/
```

## Publicarla (para instalarla en el iPhone)
La PWA necesita HTTPS. El flujo `.github/workflows/deploy.yml` la publica en GitHub Pages cuando se fusiona en `main`:
1. En el repositorio: Settings > Pages > Source: **GitHub Actions**.
2. Fusiona esta rama en `main`.
3. En el iPhone, abre la URL en Safari > Compartir > **Añadir a pantalla de inicio**.

## Tus datos
- Copia, exportar e importar: Ajustes > Copia, exportar e importar. Haz una copia JSON cada pocas semanas.
- Precios de fondos: enlace de tu Google Sheet con columnas `ISIN, Nombre, VL, Fecha`. No pongas cantidades en esa hoja.
