export function useThemeColors() {
  if (typeof window === 'undefined') {
    return {
      info: '#3B82F6',
      success: '#10B981',
      danger: '#EF4444',
      primary: '#2563ff',
      purple: '#8B5CF6',
    }
  }

  const el = document.getElementById('app-root') || document.documentElement
  const s = getComputedStyle(el as Element)
  const read = (name: string, fallback: string) => {
    const v = s.getPropertyValue(name).trim()
    return v || fallback
  }

  return {
    info: read('--color-info', '#3B82F6'),
    success: read('--color-success', '#10B981'),
    danger: read('--color-danger', '#EF4444'),
    primary: read('--color-brand-blue', '#2563ff'),
    purple: read('--color-brand-navy', '#8B5CF6'),
  }
}

export default useThemeColors
