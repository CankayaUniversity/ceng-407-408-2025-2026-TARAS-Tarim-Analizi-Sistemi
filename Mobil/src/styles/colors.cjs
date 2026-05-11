// Tailwind icin CommonJS versiyon - colors.ts ile eslendirilmeli
// CommonJS version of colors.ts — used exclusively by tailwind.config.js
// Only primitive palettes + standalone named colors are exported here.
// The semantic light/dark theme objects live in colors.ts (TypeScript only).

module.exports = {
  colors: {
    olive: {
      50:  '#f0f7e6',
      100: '#dceeca',
      200: '#b9dd95',
      300: '#96cc60',
      400: '#73bb2b',
      500: '#5a9422',
      600: '#487519',
      700: '#3D6B1F',
      800: '#2D5016',
      900: '#1e3710',
      950: '#0f1b08',
    },
    gold: {
      50:  '#fdf8e8',
      100: '#fbf1d1',
      200: '#f7e3a3',
      300: '#f3d575',
      400: '#efc847',
      500: '#D4AF37',
      600: '#a98c2b',
      700: '#7f6921',
      800: '#544616',
      900: '#2a230b',
      950: '#15110a',
    },
    // Warm olive-tinted neutral — hue ~96°, low sat. Replaces slateGrey.
    sageGray: {
      50:  '#f7f8f6',
      100: '#edefeb',
      200: '#dbdfd8',
      300: '#b9c1b3',
      400: '#97a38f',
      500: '#78876e',
      600: '#5c6954',
      700: '#434d3d',
      800: '#2d3427',
      900: '#1b2018',
      950: '#11150f',
    },
    // Standalone named colors — used as Tailwind utility classes:
    // bg-porcelain, bg-whiteSmoke, text-carbonBlack, bg-olive-800, text-gold-500 …
    porcelain:   '#FFFDF8',
    whiteSmoke:  '#F5F5F5',
    carbonBlack: '#1A1A1A',
  },
};
