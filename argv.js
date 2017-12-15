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

module.exports = parser.parseArgs();