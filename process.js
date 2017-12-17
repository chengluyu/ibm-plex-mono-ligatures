const leftPad = require('left-pad');
const inspect = require('util').inspect
const args = require('./argv')

function swapKey(any, key1, key2) {
  if (key1 === key2) {
    return;
  }
  const temp = any[key1];
  any[key1] = any[key2];
  any[key2] = temp;
}

/**
 * Map from style name to altername glyph name
 */
const style_map = {
  zero: {
    'dotted': 'zero',
    'slashed': 'zero.alt01',
    'circle': 'zero.alt02'
  },
  g: {
    'double': 'g',
    'single': 'g.alt01',
    'double2': 'g.alt02'
  },
  /**
   * Get alternate glyph name
   * @param {string} glyphName 
   * @param {string} styleName 
   */
  get(glyphName, styleName) {
    const alternateName = this[glyphName][styleName];
    if (typeof alternateName !== 'string') {
      throw new Error(`invalid style "${glyphName}" for '${glyphName}'`)
    }
    return alternateName;
  }
}

/**
 * Replace some glyph with their alternates.
 */
function useAlternate(font) {
  swapKey(font['glyf'], 'zero', style_map.get('zero', args.zero_style));
  swapKey(font['glyf'], 'g', style_map.get('g', args.g_style));
}

/**
 * Add ligature glyphs to font object
 * @param {Font} font 
 */
function addGlyphs(font) {
  function add(name, data) {
    font.glyf[name] = data;
    font.glyph_order.push(name);
    font.maxp.numGlyphs++;
  }
  // add ligature placeholder glyph
  add('LIG', { advanceWidth: 600 });
  add('hyphen_greater.liga', {
    "advanceWidth": 600,
    "references": [
      {
        "glyph": "emdash",
        "x": -500,
        "y": -7,
        "a": 1.3,
        "b": 0,
        "c": 0,
        "d": 1
      },
      {
        "glyph": "greater",
        "x": 0,
        "y": 0,
        "a": 1,
        "b": 0,
        "c": 0,
        "d": 1
      }
    ]
  });
  add('equal_greater.liga', {
    "advanceWidth": 600,
    "references": [
      {
        "glyph": "equal",
        "x": -500,
        "y": 0,
        "a": 1.5,
        "b": 0,
        "c": 0,
        "d": 1
      },
      {
        "glyph": "greater",
        "x": 0,
        "y": 0,
        "a": 1,
        "b": 0,
        "c": 0,
        "d": 1
      }
    ]
  });
  add('not_equal.liga', {
    "advanceWidth": 600,
    "references": [
      {
        "glyph": "equal",
        "x": -550,
        "y": 0,
        "a": 1.9,
        "b": 0,
        "c": 0,
        "d": 1
      },
      {
        "glyph": "slash",
        "x": -300,
        "y": 0,
        "a": 1,
        "b": 0,
        "c": 0,
        "d": 1
      }
    ]
  });
}

function addRules(font) {

  const {lookups, features, languages} = font['GSUB'];

  function addLookup(name, value) {
    // console.log('Lookup', name, 'Lookup Object', inspect(value, false, null));
    if (lookups[name]) {
      // throw new Error('lookup name already exists');
    }
    lookups[name] = value;
  }

  function addFeature(name, value) {
    // console.log('Feature', name, value);
    if (features[name]) {
      throw new Error('feature name already exists');
    }
    features[name] = value;
    for (const lang of Object.keys(languages)) {
      languages[lang].features.push(name);
    }
  }

  function getMaxFeatureNumber() {
    let num = 0;
    for (const key of Object.keys(features)) {
      const [, , id] = key.match(/^(\w{4})_(\d+)$/);
      num = Math.max(num, parseInt(id, 10));
    }
    return num;
  }

  function getMaxLookupNumber() {
    let num = 0;
    for (const key of Object.keys(lookups)) {
      const [, , id] = key.match(/^lookup_([\w\d]+)_(\d+)$/);
      num = Math.max(num, parseInt(id, 10));
    }
    return num;
  }

  let featureCounter = getMaxFeatureNumber();
  let lookupCounter = getMaxLookupNumber();

  function addCaltFeature(lookups) {
    const name = `calt_${leftPad(++featureCounter, 5, 0)}`;
    addFeature(name, lookups);
    return name;
  }

  function addSingleSub(dict) {
    const name = `lookup_ss00_${++lookupCounter}`;
    addLookup(name, {
      type: 'gsub_single',
      flags: {},
      subtables: [dict]
    });
    return name;
  }

  function addChainingSub(glyphNames, applyLookup) {
    const name = `lookup_calt_${++lookupCounter}`;
    const subtables = [];
    for (let i = 0; i < glyphNames.length; i++) {
      const match = [];
      for (let j = 0; j < i; j++) {
        match.push(['LIG']);
      }
      for (let j = i; j < glyphNames.length; j++) {
        match.push([glyphNames[j]]);
      }
      subtables.push({
        match,
        apply: [{
          at: i,
          lookup: applyLookup
        }],
        inputBegins: i,
        inputEnds: i + 1
      });
    }
    addLookup(name, {
      type: 'gsub_chaining',
      flags: {},
      subtables
    });
    return name;
  }

  function stringToGlyphNameSequence(str) {
    return [...str].map(ch => {
      const name = font.cmap[ch.charCodeAt(0)];
      if (typeof name === 'string') {
        return name;
      }
      throw new Error(`no glyph name for '${ch}'`);
    })
  }

  function addProgrammingLigatures(dict) {
    const chainings = [];
    for (const from of Object.keys(dict)) {
      const liga = dict[from];
      const glyphNames = stringToGlyphNameSequence(from);
      // generate single substitution map
      const singleSub = {};
      for (let i = 0; i < glyphNames.length - 1; i++) {
        singleSub[glyphNames[i]] = 'LIG';
      }
      singleSub[glyphNames[glyphNames.length - 1]] = liga;
      // add single substitution
      const singleSubName = addSingleSub(singleSub);
      // add chaining context sub
      const chainingSubName = addChainingSub(glyphNames, singleSubName);
      chainings.push(chainingSubName);
    }
    addCaltFeature(chainings);
  }

  addProgrammingLigatures({
    '->': 'hyphen_greater.liga',
    '=>': 'equal_greater.liga',
    '!=': 'not_equal.liga'
  });
}

module.exports = function processAll(fonts) {
  for (const font of fonts) {
    useAlternate(font);
    addGlyphs(font);
    addRules(font);
  }
}