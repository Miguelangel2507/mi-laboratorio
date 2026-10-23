/** Colores de gráficas. Provisionales hasta replica-brand. */
export const CHART_COLORS = ['#0B7A64', '#2F6FDE', '#B5651D', '#8A4FBF', '#C4271F', '#5E7A1B', '#B8860B', '#5F5F66'];
export const color = (i: number) => CHART_COLORS[i % CHART_COLORS.length];
