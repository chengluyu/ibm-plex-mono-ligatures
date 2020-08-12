const args = require('./argv')
const {buildAll, dumpAll} = require('./otfcc')
const processAll = require('./process')


const fonts = dumpAll(args.input);
processAll(fonts);
buildAll(fonts, args.output);
