const argParse = require('liquid-args');
const globby = require('globby');
const gm = require('gm');
const fs = require('fs');
const yaml = require('js-yaml');
const { promisify } = require('util');
const path = require('path');
const p = (...args) => path.join(__dirname, ...args);

const config = require(p('devices.js'));

const suffix = (filePath, suf) => {
    const { dir, name, ext } = path.parse(filePath);
    return path.join(dir, name + suf + ext);
}

const imgSuffix = (src, w, h) =>
     suffix(src, h ? `-${w}x${h}` : `-${w}w`);

module.exports.data = config;

let responsiveImages = [];

module.exports.task = function () {
    // const tasks = data.images.forEach(({ w, h }) => {
    //
    // })
    // responsiveImages.forEach(console.log);
};

const dataFile = __dirname + '/img-data.yml';
const readData = fs.promises.readFile(dataFile)
    .then(async data => {
        await fs.promises.unlink(dataFile);
        return yaml.safeLoad(data.toString());
    })
    .catch(err => {
        console.error('ERROR');
        if (err.code === 'ENOENT')
            return null;
        else
            throw err;
    });
const writeStream = readData.then(() => {
    const stream = fs.createWriteStream(dataFile, { emitClose: true });
    stream.on('close', () => console.log('stream closed'));
    return stream;
});

const write = async data => {
    const stream = await writeStream;
    // stream.on('error', e => console.error(e));
    // stream.on('close', () => console.log('stream closed'));
    return new Promise((resolve, reject) => {
        console.log('writing data');
        console.log(data);
        const line = yaml.safeDump([ data ], { flowLevel: 1 })
        stream.on('error', e => reject(e));
        stream.write(line, (err, data) =>
            err ? reject(err) : resolve(data));
    });
}

const measureImage = async path => {
    let saved = await readData;
    saved = saved && saved.find(d => d.path === path);
    if (saved) {
        await write({ ...saved, path: path });
        return saved;
    }
    return new Promise((resolve, reject) =>
        gm(p(path)).size((err, data) => {
            if (err) {
                if (err.code === 1)
                    resolve({});
                else
                    reject(err);
            } else {
                write({ ...data, path: path })
                    .then(() => resolve(data));
            }
        }));
};

const srcset = async function (src, kwargs) {
    if (kwargs && kwargs.__keywords !== true)
        throw new Error('Srcset tag only takes an image and kwargs; found second positional arg.');
    let { width } = kwargs || {};
    if (!width) width = await measureImage(src);

    if (!width) {
        console.warn(`No image found for path: ${src}`);
        return src;
    } else if (typeof width === 'string') {
        width = Number(width.replace(/\D+$/, ''));
    }

    const imageSizes = config.images.sort((a, b) => a.w - b.w);
    let srcset = [];
    for (const img of imageSizes) {
        if (width && width <= img.w) {
            srcset.push(`${src} ${width}w`);
            break;
        }
        srcset.push(`${imgSuffix(src, img.w, img.h)} ${img.w}w`);
    }

    responsiveImages.push(src);
    return srcset.join(', ');
};

module.exports.plugin = {
    initArguments: {},
    configFunction: function (eleventyConfig) {
        console.log(eleventyConfig);
        eleventyConfig.addNunjucksAsyncShortcode('srcset', srcset);
        eleventyConfig.addLiquidTag('srcset', function(liquidEngine) {
            return {
                parse: function(tagToken) {
                    this.args = tagToken.args;
                },
                render: async function(scope) {
                    console.log(scope);
                    const evalValue = arg => liquidEngine.evalValue(arg, scope);
                    const args = await Promise.all(argParse(this.args, evalValue));
                    return await Promise.resolve(srcset(...args));
                }
            };
        });

        eleventyConfig.on('afterBuild', async () => {
            console.log('afterBuild');
            (await writeStream).close();
        });
    }
};

