const leftPad = require('left-pad');
const inspect = require('util').inspect
const args = require('./argv')
const assert = require('assert');

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
  a: {
    'double': 'a',
    'single': 'a.alt01'
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
  swapKey(font['glyf'], 'a', style_map.get('a', args.a_style));
}

/**
 * Add ligature glyphs to font object
 * @param {Font} font 
 */
function addGlyphs(font) {
  const glyphs = require('./glyphs.json');
  for (const glyphName of Object.keys(glyphs)) {
    font.glyf[glyphName] = glyphs[glyphName];
    font.glyph_order.push(glyphName);
    font.maxp.numGlyphs++;
  }
}

function addRules(font) {
  const {lookups, features, languages} = font['GSUB'];

  function addLookup(name, value) {
    if (lookups[name]) {
      throw new Error('lookup name already exists');
    }
    lookups[name] = value;
  }

  function addFeature(name, value) {
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

  function addSingleSub(dict) {
    const name = `lookup_ss00_${++lookupCounter}`;
    addLookup(name, {
      type: 'gsub_single',
      flags: {},
      subtables: [dict]
    });
    return name;
  }

  function getGlyphName(ch) {
    const name = font.cmap[ch.charCodeAt(0)];
    if (typeof name === 'string') {
      return name;
    }
    throw new Error(`no glyph name for '${ch}'`);
  }

  function addTwoLetterLigature(from, to) {
    assert.equal(from.length, 2);
    const first = getGlyphName(from.charAt(0));
    const second = getGlyphName(from.charAt(1));
    // name of chaining substitution
    const name = `lookup_calt_${++lookupCounter}`;
    let firstLookup;
    let secondLookup;
    if (first === second) {
      // we need two lookups
      firstLookup = addSingleSub({ [first]: 'LIG' });
      secondLookup = addSingleSub({ [second]: to });
    } else {
      // one is enough
      firstLookup = secondLookup = addSingleSub({
        [first]: 'LIG',
        [second]: to
      });
    }
    // add chaining substitution
    addLookup(name, {
      type: 'gsub_chaining',
      flags: {},
      subtables: [
        {
          match: [ [ first ], [ second ] ],
          apply: [ { at: 0, lookup: firstLookup } ],
          inputBegins: 0,
          inputEnds: 1
        },
        {
          match: [ [ 'LIG' ], [ second ] ],
          apply: [ { at: 1, lookup: secondLookup } ],
          inputBegins: 1,
          inputEnds: 2
        }
      ]
    });
    return name;
  }

  function addProgrammingLigatures(dict) {
    const chainingLookups = [];
    for (const from of Object.keys(dict)) {
      chainingLookups.push(addTwoLetterLigature(from, dict[from]));
    }
    const name = `calt_${leftPad(++featureCounter, 5, 0)}`;
    addFeature(name, chainingLookups);
  }

  addProgrammingLigatures({
    '->': 'hyphen_greater.liga',
    '=>': 'equal_greater.liga',
    '!=': 'not_equal.liga',
    '==': 'equal_equal.liga'
  });
}

module.exports = function processAll(fonts) {
  for (const font of fonts) {
    useAlternate(font);
    addGlyphs(font);
    addRules(font);
  }
}