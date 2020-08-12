const fs = require('fs');
const child_process = require('child_process');
const path = require('path');
const mkdirp = require('mkdirp');
const os = require('os');
const args = require('./argv')


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

module.exports = {
  buildAll, dumpAll
};