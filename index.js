const argParse = require('liquid-args');
const path = require('path');
const p = (...args) => path.join(__dirname, ...args);

const data = require(p('devices.js'));

const suffix = (filePath, suf) => {
    const { dir, name, ext } = path.parse(filePath);
    return path.join(dir, name + suf + ext);
}

const imgSuffix = (src, w, h) =>
     suffix(src, h ? `-${w}x${h}` : `-${w}w`);

module.exports.data = data;

const srcset = (src, kwargs) => {
    if (kwargs && kwargs.__keywords !== true)
        throw new Error('Srcset tag only takes an image and kwargs; found second positional arg.');
    let { width } = kwargs || {};
    if (typeof width === 'string')
        width = Number(width.replace(/\D+$/, ''));

    const imageSizes = data.images.sort((a, b) => a.w - b.w);
    let srcset = [];
    for (const img of imageSizes) {
        if (width && width <= img.w) {
            srcset.push(`${src} ${width}w`);
            break;
        }
        srcset.push(`${imgSuffix(src, img.w, img.h)} ${img.w}w`);
    }

    return srcset.join(', ');
};

module.exports.plugin = {
    initArguments: {},
    configFunction: function (eleventyConfig) {
        eleventyConfig.addNunjucksShortcode('srcset', srcset);
        eleventyConfig.addLiquidTag('srcset', function(liquidEngine) {
            return {
                parse: function(tagToken) {
                    this.args = tagToken.args;
                },
                render: async function(scope) {
                    const evalValue = arg => liquidEngine.evalValue(arg, scope);
                    const args = await Promise.all(argParse(this.args, evalValue));
                    return srcset(...args);
                }
            };
        });
    }
};

