const ArgumentParser = require('argparse').ArgumentParser;
const PackageJSON = require('./package.json');
const fs = require('fs');
const child_process = require('child_process');
const path = require('path');
const mkdirp = require('mkdirp');
const os = require('os');
const rimraf = require('rimraf');
const leftPad = require('left-pad');
const inspect = require('util').inspect

const parser = new ArgumentParser({
  version: PackageJSON.version,
  addHelp: true,
  description: PackageJSON.description
});

parser.addArgument(['-i', '--input'], {
  help: 'The input directory of IBM Plex Mono',
  action: 'store',
  dest: 'input',
  required: true
});

parser.addArgument(['-p', '--otfcc-program'], {
  help: 'The directory where otfcc locates',
  action: 'store',
  dest: 'otfcc',
  defaultValue: ''
});

parser.addArgument(['-o', '--output'], {
  help: 'The output directory',
  action: 'store',
  dest: 'output',
  defaultValue: path.join('.', 'build')
});

const args = parser.parseArgs();

const otfccdump = path.join(args.otfcc, 'otfccdump');
const otfccbuild = path.join(args.otfcc, 'otfccbuild');

function dumpAll(inputdir) {
  return fs.readdirSync(inputdir).map(filename => {
    const extname = path.extname(filename);
    if (extname === '.ttf' || extname === '.otf') {
      console.log(`Dump '${path.join(inputdir, filename)}'`);
      let command = otfccdump;
      // on Windows otfccdump will generate BOM by default
      if (os.platform() === 'win32') {
        command += ' --no-bom';
      }
      command += ` "${path.join(inputdir, filename)}"`
      const stdout = child_process.execSync(command).toString();
      try {
        const font = JSON.parse(stdout);
        font.filename = filename;
        return font;
      } catch (e) {
        console.log('Got illegal output from otfccdump. Maybe font is corrupted?');
      }
    }
    return null;
  }).filter(obj => obj !== null);
}

function buildAll(fonts, outputdir) {
  mkdirp(outputdir);
  for (const font of fonts) {
    const filename = font.filename;
    delete font['filename'];
    const stdin = JSON.stringify(font);
    console.log(`Build '${path.join(outputdir, filename)}'`);
    child_process.execSync(`${otfccbuild} -o ${path.join(outputdir, filename)}`, { input: stdin });
  }
}

function addGlyphs(font, name, data) {
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
        "y": 0,
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
        "a": 1.8,
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

function processAll(fonts) {
  for (const font of fonts) {
    addGlyphs(font);
    addRules(font);
  }
}

const fonts = dumpAll(args.input);
processAll(fonts);
buildAll(fonts, args.output);
