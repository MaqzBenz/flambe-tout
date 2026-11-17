const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** 1 -> "1", 0.5 -> "0,5", 0.3333 -> "0,33" */
export const formatPoints = (p: number) => fmt.format(p);
