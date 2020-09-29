const argParse = require('liquid-args');
const gm = require('gm');
const globby = require('globby');
const fs = require('fs');
const yaml = require('js-yaml');
const os = require('os');
const path = require('path');
const p = (...args) => path.join(__dirname, ...args);

const config = require(p('devices.js'));

const fileSuffix = (filePath, suf) => {
    const { dir, name, ext } = path.parse(filePath);
    return path.join(dir, name + suf + ext);
}

const imgSuffix = (src, w, h) => fileSuffix(src, h ? `-${w}x${h}` : `-${w}w`);

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

class BuildEnv {
    constructor(opts={}) {
        let {
            inputDir = '.',
            outputDir = path.join('.', '_site')
        } = opts;
        this.inputDir = inputDir;
        this.outputDir = outputDir;
    }
}

class Image extends BuildEnv {
    constructor(src, opts={}) {
        super(opts);
        this.src = src;
        this.inPath = path.join(this.inputDir, ...src.split('/'));
        this.outPath = path.join(this.outputDir, ...src.split('/'));

        this.measure = this.measure.bind(this);
        this.resizeTask = this.resizeTask.bind(this);
    }

    async measure(cache) { // maybe put cache in constructor
        let saved = await cache.data;
        saved = saved && saved.find(d => d.path === this.inPath);
        if (saved) {
            await cache.write({ ...saved, path: this.inPath });
            return saved;
        }
        return new Promise((resolve, reject) =>
            gm(this.inPath).size((err, data) => {
                if (err && err.code === 1) {
                    resolve({}); // may want to just throw err here, catch outside
                } else if (err) {
                    reject(err);
                } else {
                    cache.write({ ...data, path: this.inPath })
                        .then(() => resolve(data));
                }
            }));
    }

    resizeTask(w, h) {
        return () => new Promise((resolve, reject) =>
            gm(this.inPath)
            .noProfile()
            .resize(w, h, '^')
            .write(imgSuffix(this.outPath, w, h), (e, d) =>
                e ? reject(e) : resolve(d)));
    }
}

class Images extends BuildEnv {
    constructor (opts={}) {
        super(opts);
        let {
            dataFile = path.join(__dirname, 'img-data.yml'),
            devices, images, queries, maxParallel
        } = opts;
        this.devices = devices || config.devices;
        this.images = images || config.images;
        this.queries = queries || config.queries;
        this.imageSizes = new Data(dataFile);
        this.maxParallel = maxParallel || os.cpus().length;
        this.tasks = [];
    }

    async srcset(src, kwargs) {
        if (kwargs && kwargs.__keywords !== true)
            throw new Error('Srcset tag only takes an image and kwargs; found second positional arg.');
        const img = new Image(src, this);
        let { width } = kwargs || await img.measure(this.imageSizes) || {};

        if (!width) {
            console.warn(`No image found for path: ${src}`);
            return src;
        } else if (typeof width === 'string') {
            width = Number(width.replace(/\D+$/, ''));
        }

        const imageSizes = this.images
            .filter(img => img.w < width)
            .sort((a, b) => a.w - b.w);

        const existingOutputs = await globby(fileSuffix(img.outPath, '*'));
        const newTasks = imageSizes.map(i => {
            const outPath = imgSuffix(img.outPath, i.w);
            if (existingOutputs.includes(outPath))
                return null;
            return img.resizeTask(i.w);
        }).filter(task => task);
        this.tasks = this.tasks.concat(newTasks);
        if (!this.runningTasks)
            await this.runTasks();

        const srcset = [
            ...imageSizes.map(i => `${imgSuffix(img.src, i.w)} ${i.w}w`),
            `${src} ${width}w`
        ]
        return srcset.join(', ');
    }

    async runTasks() { // runs async processes
        this.runningTasks = true;
        const results = [];
        const executing = [];
        while (this.tasks.length) {
            if (executing.length < this.maxParallel) {
                let task = this.tasks.shift();
                task = task().then(r => {
                    const i = executing.indexOf(task);
                    executing.splice(i, 1);
                    return r;
                })
                executing.push(task);
            } else {
                const next = await Promise.race(executing);
                results.push(next);
            }
        }
        this.runningTasks = false;
        return results;
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
