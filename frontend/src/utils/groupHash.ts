// Функция для генерации hash группы (поддержка Unicode)
export const generateGroupHash = (groupName: string): string => {
  // Преобразуем строку в UTF-8, затем в base64
  // Используем encodeURIComponent для поддержки кириллицы
  const utf8Encoded = encodeURIComponent(groupName);
  // Преобразуем в base64
  const base64Encoded = btoa(utf8Encoded).replace(/[+/=]/g, (match) => {
    return { '+': '-', '/': '_', '=': '' }[match] || '';
  });
  return base64Encoded;
};

// Функция для декодирования hash группы
export const decodeGroupHash = (hash: string): string => {
  try {
    // Восстанавливаем base64 символы
    const base64Decoded = hash.replace(/[-_]/g, (match) => {
      return { '-': '+', '_': '/' }[match] || '';
    });
    // Декодируем из base64
    const utf8Decoded = atob(base64Decoded);
    // Декодируем из URI компонента обратно в строку
    return decodeURIComponent(utf8Decoded);
  } catch {
    return hash; // Если не удалось декодировать, возвращаем как есть
  }
};

