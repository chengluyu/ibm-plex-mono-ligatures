const ArgumentParser = require('argparse').ArgumentParser;
const PackageJSON = require('./package.json');
const path = require('path');


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

parser.addArgument('--zero-style', {
  help: 'The style of "0", valid values are "circle", "slashed" or "dotted"',
  action: 'store',
  dest: 'zero_style',
  defaultValue: 'dotted'
});

parser.addArgument('--g-style', {
  help: 'The style of "g", valid values are "single", "double" or "double2"',
  action: 'store',
  dest: 'g_style',
  defaultValue: 'double'
});

parser.addArgument('--a-style', {
  help: 'The style of "a", valid values are "single" or "double"',
  action: 'store',
  dest: 'a_style',
  defaultValue: 'double'
});

module.exports = parser.parseArgs();