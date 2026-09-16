import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';
import type { PluginAPI } from 'tailwindcss/types/config';
import plugin from 'tailwindcss/plugin';

const config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
        '3xl': '1800px',
      },
    },
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
    },
    borderWidth: {
      '0': '0',
      '2': '2px',
      '3': '3px',
      '4': '4px',
      '6': '6px',
      '8': '8px',
      '1.5': '1.5px',
      DEFAULT: '1px',
    },
    extend: {
      gridTemplateColumns: {
        '13': 'repeat(13, minmax(0, 1fr))',
      },
      maxWidth: {
        '8xl': '90rem',
      },
      fontFamily: {
        serif: ['Arizona Mix', 'serif'],
        sans: ['FK Grotesk', 'sans-serif'],
        'sans-neue': ['FK Grotesk Neue', 'sans-serif'],
        label: ['Px Grotesk', 'ui-monospace', 'SFMono-Regular'],
        mono: ['FK Grotesk Mono', 'ui-monospace', 'SFMono-Regular'],
      },
      fontWeight: {
        'var-350': '350',
      },
      colors: {
        blue: {
          '50': '#F0F3FF',
          '100': '#DCE5FF',
          '200': '#C5D1F1',
          '300': '#96B0F8',
          '400': '#738EE8',
          '500': '#6177D1',
          '600': '#4757A0',
          '700': '#334299',
          '800': '#2933A3',
          '900': '#292682',
          '950': '#24204C',
        },
        gray: {
          '50': '#F6F6F9',
          '100': '#EAECF1',
          '200': '#D4D7E2',
          '300': '#BCC1D2',
          '400': '#9DA4BE',
          '500': '#7882A5',
          '600': '#5A6387',
          '700': '#545B75',
          '800': '#464C62',
          '900': '#373C4D',
          '950': '#292C38',
        },
        yellow: '#E8B83E',
        orange: '#d34b21',
        green: '#00a86b',
        gold: '#A57A3A',
        psblue: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        psred: '#A71A45',
        navy: {
          DEFAULT: 'hsl(var(--navy))',
        },
        mist: '#F8F8FD',
        lavender: '#E7E6F6',
        selected: 'hsla(var(--gray) / 0.1)',
        hover: 'hsla(var(--gray) / 0.085)',
        border: 'hsl(var(--border))',
        axis: 'hsl(var(--axis))',
        input: {
          DEFAULT: 'hsl(var(--input))',
          fill: 'var(--input-fill)',
        },
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        band: 'hsl(var(--band))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        'primary-2': {
          DEFAULT: 'hsl(var(--primary-2))',
          foreground: 'hsl(var(--primary-2-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      letterSpacing: {
        widest: '.25em',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: '0.25rem',
        sm: 'calc(var(--radius) - 4px)',
        xs: 'calc(var(--radius) - 6px)',
      },
      keyframes: {
        shimmer: {
          '100%': {
            transform: 'translateX(100%)',
          },
        },
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
        'caret-blink': {
          '0%,70%,100%': {
            opacity: '1',
          },
          '20%,50%': {
            opacity: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'caret-blink': 'caret-blink 1.25s ease-out infinite',
      },
      opacity: {
        '3': '0.03',
        '4': '0.04',
        '6': '0.06',
        '7': '0.07',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('tailwindcss-animate'),
    require('@tailwindcss/forms'),
    require('tailwind-scrollbar'),
    plugin(function ({ addBase, matchUtilities }: PluginAPI) {
      // This handles the arbitrary values
      matchUtilities(
        {
          font: (value, { modifier }) => {
            const numericValue = Number(value);
            if (!isNaN(numericValue)) {
              return {
                'font-weight': value,
                'font-variation-settings': `'wght' ${numericValue}`,
              };
            }
            return null;
          },
        },
        {
          type: ['number', 'any'],
          supportsNegativeValues: false,
        },
      );

      // Add base styles for standard font weights
      addBase({
        '.font-thin': { 'font-variation-settings': '"wght" 100' },
        '.font-extralight': { 'font-variation-settings': '"wght" 270' },
        '.font-light': { 'font-variation-settings': '"wght" 300' },
        '.font-normal': { 'font-variation-settings': '"wght" 400' },
        '.font-medium': { 'font-variation-settings': '"wght" 500' },
        '.font-semibold': { 'font-variation-settings': '"wght" 600' },
        '.font-bold': { 'font-variation-settings': '"wght" 700' },
        '.font-extrabold': { 'font-variation-settings': '"wght" 800' },
        '.font-black': { 'font-variation-settings': '"wght" 900' },
      });
    }),
  ],
} satisfies Config;

export default config;
