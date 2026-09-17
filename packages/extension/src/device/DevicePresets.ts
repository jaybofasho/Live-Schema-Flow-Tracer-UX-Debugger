export type DeviceCategory = 'web' | 'mobile' | 'tablet' | 'dynamic';

export interface ViewportConfig {
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  orientation: 'portrait' | 'landscape';
  presetId?: string;
  presetName?: string;
  category: DeviceCategory;
}

export interface DevicePreset {
  id: string;
  name: string;
  category: DeviceCategory;
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  aspectRatio: string;
  icon?: string;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  // --- Web / Desktop ---
  {
    id: 'web-fhd',
    name: 'Desktop FHD',
    category: 'web',
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
    aspectRatio: '16:9',
    icon: '💻'
  },
  {
    id: 'web-macbook-air',
    name: 'MacBook Air 13"',
    category: 'web',
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
    aspectRatio: '16:10',
    icon: '💻'
  },
  {
    id: 'web-laptop-std',
    name: 'Laptop Standard',
    category: 'web',
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
    aspectRatio: '16:9',
    icon: '💻'
  },
  {
    id: 'web-4k',
    name: 'Desktop 4K UHD',
    category: 'web',
    width: 3840,
    height: 2160,
    deviceScaleFactor: 2,
    mobile: false,
    aspectRatio: '16:9',
    icon: '🖥️'
  },
  {
    id: 'web-compact',
    name: 'Compact Desktop',
    category: 'web',
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
    aspectRatio: '16:9',
    icon: '💻'
  },

  // --- Tablet ---
  {
    id: 'tablet-ipad-pro',
    name: 'iPad Pro 12.9"',
    category: 'tablet',
    width: 1024,
    height: 1366,
    deviceScaleFactor: 2,
    mobile: true,
    aspectRatio: '3:4',
    icon: '📟'
  },
  {
    id: 'tablet-ipad-air',
    name: 'iPad Air / 11"',
    category: 'tablet',
    width: 820,
    height: 1180,
    deviceScaleFactor: 2,
    mobile: true,
    aspectRatio: '4:5.7',
    icon: '📟'
  },
  {
    id: 'tablet-ipad-10th',
    name: 'iPad 10th Gen',
    category: 'tablet',
    width: 810,
    height: 1080,
    deviceScaleFactor: 2,
    mobile: true,
    aspectRatio: '3:4',
    icon: '📟'
  },
  {
    id: 'tablet-ipad-mini',
    name: 'iPad Mini',
    category: 'tablet',
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    mobile: true,
    aspectRatio: '3:4',
    icon: '📟'
  },
  {
    id: 'tablet-galaxy-s9',
    name: 'Samsung Tab S9',
    category: 'tablet',
    width: 800,
    height: 1280,
    deviceScaleFactor: 2,
    mobile: true,
    aspectRatio: '16:10',
    icon: '📟'
  },

  // --- Mobile ---
  {
    id: 'mobile-iphone-16-pro',
    name: 'iPhone 16 / 15 Pro',
    category: 'mobile',
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    mobile: true,
    aspectRatio: '9:19.5',
    icon: '📱'
  },
  {
    id: 'mobile-iphone-16-promax',
    name: 'iPhone 16 Pro Max',
    category: 'mobile',
    width: 440,
    height: 956,
    deviceScaleFactor: 3,
    mobile: true,
    aspectRatio: '9:19.5',
    icon: '📱'
  },
  {
    id: 'mobile-pixel-9',
    name: 'Google Pixel 9 / 8',
    category: 'mobile',
    width: 412,
    height: 915,
    deviceScaleFactor: 3.5,
    mobile: true,
    aspectRatio: '9:20',
    icon: '📱'
  },
  {
    id: 'mobile-galaxy-s24',
    name: 'Samsung Galaxy S24',
    category: 'mobile',
    width: 360,
    height: 780,
    deviceScaleFactor: 3,
    mobile: true,
    aspectRatio: '9:19.5',
    icon: '📱'
  },
  {
    id: 'mobile-iphone-se',
    name: 'iPhone SE (3rd Gen)',
    category: 'mobile',
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    mobile: true,
    aspectRatio: '9:16',
    icon: '📱'
  }
];

export const DEFAULT_VIEWPORT: ViewportConfig = {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1,
  mobile: false,
  orientation: 'landscape',
  presetId: 'web-fhd',
  presetName: 'Desktop FHD (1920×1080)',
  category: 'web'
};

export function getPresetsByCategory(category: DeviceCategory): DevicePreset[] {
  if (category === 'dynamic') return [];
  return DEVICE_PRESETS.filter(p => p.category === category);
}

export function findPresetById(id: string): DevicePreset | undefined {
  return DEVICE_PRESETS.find(p => p.id === id);
}

export function calculateAspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(Math.round(width), Math.round(height));
  const wRatio = Math.round(width / divisor);
  const hRatio = Math.round(height / divisor);

  // Common approximation checks
  const decimal = width / height;
  if (Math.abs(decimal - 16 / 9) < 0.02) return '16:9';
  if (Math.abs(decimal - 9 / 16) < 0.02) return '9:16';
  if (Math.abs(decimal - 16 / 10) < 0.02) return '16:10';
  if (Math.abs(decimal - 4 / 3) < 0.02) return '4:3';
  if (Math.abs(decimal - 3 / 4) < 0.02) return '3:4';
  if (Math.abs(decimal - 9 / 19.5) < 0.03) return '9:19.5';
  if (Math.abs(decimal - 19.5 / 9) < 0.03) return '19.5:9';

  return `${wRatio}:${hRatio}`;
}

export function toggleOrientation(viewport: ViewportConfig): ViewportConfig {
  const newOrientation = viewport.orientation === 'portrait' ? 'landscape' : 'portrait';
  // Swap width and height if changing orientation
  const shouldSwap =
    (newOrientation === 'portrait' && viewport.width > viewport.height) ||
    (newOrientation === 'landscape' && viewport.height > viewport.width);

  const width = shouldSwap ? viewport.height : viewport.width;
  const height = shouldSwap ? viewport.width : viewport.height;

  return {
    ...viewport,
    width,
    height,
    orientation: newOrientation
  };
}

export function createDynamicViewport(
  width: number,
  height: number,
  dpr: number = 1,
  isMobile: boolean = false
): ViewportConfig {
  const orientation = width >= height ? 'landscape' : 'portrait';
  let category: DeviceCategory = 'dynamic';
  if (width <= 480) category = 'mobile';
  else if (width <= 1024) category = 'tablet';
  else category = 'web';

  return {
    width: Math.max(320, Math.min(3840, Math.round(width))),
    height: Math.max(320, Math.min(2400, Math.round(height))),
    deviceScaleFactor: dpr,
    mobile: isMobile || width <= 768,
    orientation,
    presetId: 'custom',
    presetName: `Custom (${width}×${height})`,
    category
  };
}
