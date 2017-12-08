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
  required: true
});

const args = parser.parseArgs();

const otfccdump = path.join(args.otfcc, 'otfccdump');
const otfccbuild = path.join(args.otfcc, 'otfccbuild');

function dumpAll(inputdir) {
  return fs.readdirSync(inputdir).map(filename => {
    if (path.extname(filename) === '.ttf') {
      console.log(`Dump '${path.join(inputdir, filename)}'`);
      let command = otfccdump;
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
  }).filter(obj => obj !== null)
}

function buildAll(fonts, outputdir) {
  mkdirp('./build')
  for (const font of fonts) {
    const filename = font.filename;
    delete font['filename'];
    const stdin = JSON.stringify(font);
    // console.log(`${otfccbuild} -o ${path.join(outputdir, filename)}`);
    console.log(`Build '${path.join(outputdir, filename)}'`);
    child_process.execSync(`${otfccbuild} -o ${path.join(outputdir, filename)}`, { input: stdin });
  }
}

const fonts = dumpAll(args.input);
buildAll(fonts, args.output);
