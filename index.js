const argParse = require('liquid-args');
const gm = require('gm');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const p = (...args) => path.join(__dirname, ...args);

const config = require(p('devices.js'));

const suffix = (filePath, suf) => {
    const { dir, name, ext } = path.parse(filePath);
    return path.join(dir, name + suf + ext);
}

const imgSuffix = (src, w, h) =>
     suffix(src, h ? `-${w}x${h}` : `-${w}w`);

class Data {
    constructor(path) {
        this.path = path;
        this.data = fs.promises.readFile(path)
            .then(data => yaml.safeLoad(data.toString()))
            .catch(err => {
                if (err.code === 'ENOENT')
                    return null;
                else
                    throw err;
            });
        this.stream = this.data.then(async data => {
            if (data !== null) await fs.promises.unlink(path);
            return fs.createWriteStream(path);
        })
    }

    async write(data) {
        const stream = await this.stream;
        return new Promise((resolve, reject) => {
            const line = yaml.safeDump([ data ], { flowLevel: 1 })
            stream.on('error', e => reject(e));
            stream.write(line, (err, data) =>
                err ? reject(err) : resolve(data));
        })
    }
}

class Images {
    constructor (opts={}) {
        let {
            inputDir = '.',
            outputDir = path.join('.', '_site'),
            dataFile = path.join(__dirname, 'img-data.yml'),
            devices, images, queries
        } = opts;
        this.input = inputDir;
        this.output = outputDir;
        this.devices = devices || config.devices;
        this.images = images || config.images;
        this.queries = queries || config.queries;
        this.imageSizes = new Data(dataFile);
        this.tasks = [];

    }

    suffix (src, w, h) {
         return suffix(src, h ? `-${w}x${h}` : `-${w}w`)
    }

    async measureImage(path) {
        let saved = await this.imageSizes.data;
        saved = saved && saved.find(d => d.path === path);
        if (saved) {
            await this.imageSizes.write({ ...saved, path: path });
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
                    this.imageSizes.write({ ...data, path: path })
                        .then(() => resolve(data));
                }
            }));
    }

    async srcset(src, kwargs) {
        if (kwargs && kwargs.__keywords !== true)
            throw new Error('Srcset tag only takes an image and kwargs; found second positional arg.');
        let file = path.join(this.input, src)
        let { width } = kwargs || await this.measureImage(file) || {};

        if (!width) {
            console.warn(`No image found for path: ${src}`);
            return src;
        } else if (typeof width === 'string') {
            width = Number(width.replace(/\D+$/, ''));
        }

        const imageSizes = this.images
            .filter(img => img.w < width)
            .sort((a, b) => a.w - b.w);
        this.tasks.push({
            src: src,
            transforms: imageSizes.map(i => ({ width: i.w }))
        });
        const srcset = [
            ...imageSizes.map(i => `${imgSuffix(src, i.w)} ${i.w}w`),
            `${src} ${width}w`
        ]
        console.log(this.tasks);
        return srcset.join(', ');
    }

    get plugin () {
        const _t = this;
        return {
            initArguments: {},
            configFunction: function (eleventyConfig) {
                const srcset = _t.srcset.bind(_t)
                eleventyConfig.addNunjucksAsyncShortcode('srcset', srcset);
                eleventyConfig.addLiquidTag('srcset', function(liquidEngine) {
                    return {
                        parse: function(tagToken) {
                            this.args = tagToken.args;
                        },
                        render: async function(scope) {
                            const evalValue = arg => liquidEngine.evalValue(arg, scope);
                            const args = await Promise.all(argParse(this.args, evalValue));
                            return await srcset(...args);
                        }
                    };
                });

                eleventyConfig.on('afterBuild', async () => {
                    (await _t.imageSizes.stream).end();
                });
            }
        }
    }
}

module.exports = Images;
