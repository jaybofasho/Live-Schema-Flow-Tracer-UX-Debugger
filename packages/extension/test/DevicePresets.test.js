const test = require('node:test');
const assert = require('node:assert');
const {
  DEVICE_PRESETS,
  getPresetsByCategory,
  calculateAspectRatio,
  toggleOrientation,
  createDynamicViewport
} = require('../dist/device/DevicePresets');

test('DevicePresets includes Web, Mobile, and Tablet categories', () => {
  const webPresets = getPresetsByCategory('web');
  const mobilePresets = getPresetsByCategory('mobile');
  const tabletPresets = getPresetsByCategory('tablet');

  assert.ok(webPresets.length >= 3, 'Should have at least 3 web presets');
  assert.ok(mobilePresets.length >= 3, 'Should have at least 3 mobile presets');
  assert.ok(tabletPresets.length >= 3, 'Should have at least 3 tablet presets');

  // Verify key presets exist
  assert.ok(webPresets.some(p => p.width === 1920 && p.height === 1080), 'FHD Desktop exists');
  assert.ok(mobilePresets.some(p => p.id === 'mobile-iphone-16-pro' && p.width === 393 && p.height === 852), 'iPhone 16 Pro exists');
  assert.ok(tabletPresets.some(p => p.id === 'tablet-ipad-pro' && p.width === 1024 && p.height === 1366), 'iPad Pro exists');
});

test('calculateAspectRatio returns correct aspect ratios for standard resolutions', () => {
  assert.strictEqual(calculateAspectRatio(1920, 1080), '16:9');
  assert.strictEqual(calculateAspectRatio(1440, 900), '16:10');
  assert.strictEqual(calculateAspectRatio(1024, 768), '4:3');
  assert.strictEqual(calculateAspectRatio(393, 852), '9:19.5');
});

test('toggleOrientation swaps width and height correctly', () => {
  const portrait = {
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    mobile: true,
    orientation: 'portrait',
    category: 'mobile'
  };

  const landscape = toggleOrientation(portrait);
  assert.strictEqual(landscape.orientation, 'landscape');
  assert.strictEqual(landscape.width, 852);
  assert.strictEqual(landscape.height, 393);

  const backToPortrait = toggleOrientation(landscape);
  assert.strictEqual(backToPortrait.orientation, 'portrait');
  assert.strictEqual(backToPortrait.width, 393);
  assert.strictEqual(backToPortrait.height, 852);
});

test('createDynamicViewport generates valid dynamic configuration', () => {
  const dynamicMobile = createDynamicViewport(400, 800, 2);
  assert.strictEqual(dynamicMobile.width, 400);
  assert.strictEqual(dynamicMobile.height, 800);
  assert.strictEqual(dynamicMobile.deviceScaleFactor, 2);
  assert.strictEqual(dynamicMobile.category, 'mobile');
  assert.strictEqual(dynamicMobile.mobile, true);
  assert.strictEqual(dynamicMobile.orientation, 'portrait');

  const dynamicDesktop = createDynamicViewport(1600, 900, 1);
  assert.strictEqual(dynamicDesktop.category, 'web');
  assert.strictEqual(dynamicDesktop.orientation, 'landscape');
  assert.strictEqual(dynamicDesktop.mobile, false);
});
