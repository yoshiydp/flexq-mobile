export const getFileName = (path: string): string => {
  try {
    const fileName = path.split('/').pop() ?? '';
    return fileName.replace(/\.[^/.]+$/, '');
  } catch {
    return '';
  }
};
