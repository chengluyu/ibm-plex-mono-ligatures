const ArgumentParser = require('argparse').ArgumentParser;
const PackageJSON = require('./package.json');
const fs = require('fs');
const child_process = require('child_process');
const path = require('path');
const mkdirp = require('mkdirp');
const os = require('os');
const rimraf = require('rimraf');

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

  addFeature("calt_00030", [
    "lookup_calt_17"
  ]);

  addFeature("ss06_00031", [
    "lookup_ss06_18"
  ]);

  addLookup("lookup_calt_17", {
    "type": "gsub_chaining",
    "flags": {},
    "subtables": [
      {
        "match": [
          [ "hyphen" ],
          [ "greater" ]
        ],
        "apply": [
          {
            "at": 0,
            "lookup": "lookup_ss06_18"
          }
        ],
        "inputBegins": 0,
        "inputEnds": 1
      },
      {
        "match": [
          [ "LIG" ],
          [ "greater" ]
        ],
        "apply": [
          {
            "at": 1,
            "lookup": "lookup_ss06_18"
          }
        ],
        "inputBegins": 1,
        "inputEnds": 2
      }
    ]
  });

  addLookup("lookup_ss06_18", {
    "type": "gsub_single",
    "flags": {},
    "subtables": [
      {
        "hyphen": "LIG",
        "greater": "hyphen_greater.liga"
      }
    ]
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
