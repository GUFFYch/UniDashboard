/**
 * Округляет число в большую сторону до указанного количества знаков после запятой
 * @param value - число для округления
 * @param decimals - количество знаков после запятой (по умолчанию 2)
 * @returns округленное число
 */
export const roundUp = (value: number, decimals: number = 2): number => {
  const multiplier = Math.pow(10, decimals);
  return Math.ceil(value * multiplier) / multiplier;
};

/**
 * Форматирует число с округлением до 2 знаков после запятой
 * @param value - число для форматирования
 * @returns отформатированная строка
 */
export const formatGrade = (value: number): string => {
  return (Math.round(value * 100) / 100).toFixed(2);
};

