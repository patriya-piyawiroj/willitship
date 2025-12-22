// Centralized theme configuration
export const theme = {
  colors: {
    // Primary gradients (blue to green)
    primary: {
      start: '#3B82F6', // Blue
      end: '#10B981', // Green
      dark: '#1E40AF',
      light: '#60A5FA',
    },
    // Background colors
    background: {
      main: '#0F172A', // Dark slate
      secondary: '#1E293B', // Slate 800
      tertiary: '#334155', // Slate 700
      card: '#1E293B',
    },
    // Text colors
    text: {
      primary: '#F1F5F9', // Slate 100
      secondary: '#CBD5E1', // Slate 300
      tertiary: '#94A3B8', // Slate 400
      muted: '#64748B', // Slate 500
    },
    // Accent colors
    accent: {
      blue: '#3B82F6',
      green: '#10B981',
      cyan: '#06B6D4',
      purple: '#8B5CF6',
    },
    // Status colors
    status: {
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
    },
    // Border colors
    border: {
      default: '#334155',
      light: '#475569',
      dark: '#1E293B',
    },
    // Shadows
    shadow: {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.4)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.6)',
    },
  },
  gradients: {
    primary: 'linear-gradient(135deg, #3B82F6 0%, #10B981 100%)',
    secondary: 'linear-gradient(135deg, #1E40AF 0%, #059669 100%)',
    accent: 'linear-gradient(135deg, #06B6D4 0%, #8B5CF6 100%)',
    background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
  },
  borderRadius: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
  },
  transitions: {
    fast: '150ms ease-in-out',
    normal: '300ms ease-in-out',
    slow: '500ms ease-in-out',
  },
};

// Apply theme to CSS variables
export function applyTheme() {
  const root = document.documentElement;
  
  // Colors
  Object.entries(theme.colors).forEach(([category, values]) => {
    Object.entries(values).forEach(([key, value]) => {
      root.style.setProperty(`--color-${category}-${key}`, value);
    });
  });
  
  // Gradients
  Object.entries(theme.gradients).forEach(([key, value]) => {
    root.style.setProperty(`--gradient-${key}`, value);
  });
  
  // Spacing
  Object.entries(theme.spacing).forEach(([key, value]) => {
    root.style.setProperty(`--spacing-${key}`, value);
  });
  
  // Border radius
  Object.entries(theme.borderRadius).forEach(([key, value]) => {
    root.style.setProperty(`--radius-${key}`, value);
  });
  
  // Transitions
  Object.entries(theme.transitions).forEach(([key, value]) => {
    root.style.setProperty(`--transition-${key}`, value);
  });
}

