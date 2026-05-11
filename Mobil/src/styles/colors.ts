// ─── Primitive palette scales ─────────────────────────────────────────────────
// Change a value here → updates both Tailwind utilities and the JS theme object.
// These are internal support data; components should use semantic tokens only.

export const palette = {
  olive: {
    50:  '#f0f7e6',
    100: '#dceeca',
    200: '#b9dd95',
    300: '#96cc60',
    400: '#73bb2b',
    500: '#5a9422',
    600: '#487519',
    700: '#3D6B1F', // oliveLeaf2
    800: '#2D5016', // oliveLeaf — primary brand anchor
    900: '#1e3710',
    950: '#0f1b08',
  },
  gold: {
    50:  '#fdf8e8',
    100: '#fbf1d1',
    200: '#f7e3a3',
    300: '#f3d575',
    400: '#efc847',
    500: '#D4AF37', // metallicGold — accent anchor
    600: '#a98c2b',
    700: '#7f6921',
    800: '#544616',
    900: '#2a230b',
    950: '#15110a',
  },
  // Warm olive-tinted neutral — hue ~96°, low sat. Replaces slateGrey.
  // Used for secondary text, muted text, borders, dividers.
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
  // Standalone named colors — available as direct Tailwind utility classes
  // e.g. bg-porcelain, bg-whiteSmoke, bg-carbonBlack
  porcelain:   '#FFFDF8',
  whiteSmoke:  '#F5F5F5',
  carbonBlack: '#1A1A1A',
};

// ─── Semantic light theme ──────────────────────────────────────────────────────
// Used by getTheme(false). All values reference palette — change palette → changes here.

export const light = {
  background:     palette.porcelain,        // #FFFDF8  large page backgrounds
  surface:        palette.whiteSmoke,       // #F5F5F5  cards, inputs, sections
  card:           palette.porcelain,        // #FFFDF8  elevated cards — warm white, no pure white
  border:         '#D5D0C0',               //          warm olive-tinted borders
  divider:        '#E8E5DC',              //          subtle list dividers
  overlay:        'rgba(26,26,26,0.50)',  //          modal / sheet backdrop
  textMain:       palette.carbonBlack,     // #1A1A1A  primary text
  textSecondary:  palette.sageGray[600], // #5c6954  secondary / helper text
  textMuted:      palette.sageGray[400], // #97a38f  placeholder / disabled text
  textOnPrimary:  palette.porcelain,      //          text on olive primary buttons
  textOnAccent:   palette.carbonBlack,    //          text on gold accent elements
  primary:        palette.olive[800],     // #2D5016  brand / CTAs / active states
  primaryPressed: palette.olive[700],     // #3D6B1F  pressed / hover emphasis
  accent:         palette.gold[500],      // #D4AF37  highlights, badges, small CTAs
  success:        '#22C55E',
  successSoft:    '#DCFCE7',
  warning:        '#F59E0B',
  warningSoft:    '#FEF9C3',
  danger:         '#EF4444',
  dangerSoft:     '#FEE2E2',
  info:           '#3B82F6',
  infoSoft:       '#DBEAFE',
  shadowColor:    palette.carbonBlack,   // #1A1A1A  use with reduced opacity
};

// ─── Semantic dark theme ───────────────────────────────────────────────────────
// Used by getTheme(true). Same token names, different values.

export const dark = {
  background:     palette.carbonBlack,   // #1A1A1A
  surface:        '#252221',             //          warm dark surface
  card:           '#2E2B28',             //          slightly elevated dark card
  border:         'rgba(245,245,245,0.12)',
  divider:        'rgba(245,245,245,0.06)',
  overlay:        'rgba(0,0,0,0.70)',
  textMain:       palette.whiteSmoke,    // #F5F5F5
  textSecondary:  palette.sageGray[300], // #b9c1b3
  textMuted:      palette.sageGray[500], // #78876e
  textOnPrimary:  palette.whiteSmoke,    //          text on olive buttons
  textOnAccent:   palette.carbonBlack,   //          text on gold elements
  primary:        palette.olive[700],    // #3D6B1F  brighter olive for dark bg
  primaryPressed: palette.olive[800],    // #2D5016
  accent:         palette.gold[500],     // #D4AF37
  success:        '#4ADE80',
  successSoft:    '#0D2D18',
  warning:        '#FCD34D',
  warningSoft:    '#2D2010',
  danger:         '#F87171',
  dangerSoft:     '#2D1212',
  info:           '#60A5FA',
  infoSoft:       '#101E3D',
  shadowColor:    '#000000',
};
