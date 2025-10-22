export const getFileExtension = (path: string): string => {
  try {
    const ext = path.split('.').pop() ?? '';
    return ext;
  } catch {
    return '';
  }
};
