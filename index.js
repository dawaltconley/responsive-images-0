const argParse = require('liquid-args');
const { parse:bgParse } = require('bg-size-parser');
const gm = require('gm');
const globby = require('globby');
const sass = require('node-sass');
const sassUtils = require('node-sass-utils');
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

const imgSuffix = (src, w, h) => {
    let suffix = `-${w}x${h}`;
    if (!h && !w)
        throw new Error('imgSuffix missing both width and height arguments; needs at least one.');
    else if (w && !h)
        suffix = `-${w}w`;
    else if (h && !w)
        suffix = `-${h}h`;
    return fileSuffix(src, suffix);
}

const permute = (matrix, permutations=[], a=[]) => {
    if (a.length === matrix.length) // if is matrix length, consider it a complete permutation and add it to perms
        return permutations.push([ ...a ]);

    let row = matrix[a.length];

    for (let item of row)
        permute(matrix, permutations, [ ...a, item ]); //call function on each row

    return permutations;
};

// const resize = {
//     cover: '^',
//     contain: ''
// };
//
// const getResize = k => resize[k] || '!';

var grav = [
    {
        top: 'North',
        bottom: 'South',
    },
    {
        right: 'East',
        left: 'West',
    }
];

var getGrav = (x, y) => grav.map(g => g[x] || g[y]).join('') || 'Center';

// for cacheing image sizes in a file so they don't need to be re-read each time
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
        super(opts); // can get rid of this if i'm alwas passing the context of Images
        this.src = src;
        this.cache = opts.cache;
        this.inPath = path.join(this.inputDir, ...src.split('/'));
        this.outPath = path.join(this.outputDir, ...src.split('/'));
        this.alreadyGenerated = globby(fileSuffix(this.outPath, '*'));

        this.gmSize = this.gmSize.bind(this);
        this.measure = this.measure.bind(this);
        this.resizeTask = this.resizeTask.bind(this);
    }

    get orientation() {
        if (!this.width || !this.height)
            return undefined;
        return this.width >= this.height ? 'landscape' : 'portrait';
    }

    gmSize() { // put outside class
        return new Promise((resolve, reject) =>
            gm(this.inPath)
            .size((err, data) =>
                err ? reject(err) : resolve(data)));
    }

    async measure() {
        let { width, height } = this;
        if (!width || !height) {
            let saved = await this.cache.then(r => r.data);
            saved = saved && saved.find(d => d.path === this.inPath);
            ({ width, height } = saved || await this.gmSize()); // catch err.code === 1 from gmSize, means no image found
        }
        await this.cache.write({ path: this.inPath, width: width, height: height });
        Object.assign(this, { width: width, height: height });
        return {
            width: width,
            height: height
        };
    }

    resizeTask(w, h, opts={}) {
        let {
            gravity = 'Center',
        } = opts;
        const outPath = imgSuffix(this.outPath, w, h);
        return async () => {
            try {
                await fs.promises.access(outPath);
            } catch (e) {
                if (e.code === 'ENOENT')
                    return null;
                throw e
            }
            return new Promise((resolve, reject) =>
                gm(this.inPath)
                .noProfile()
                .resize(w, h, '^')
                .gravity(gravity)
                .write(outPath, (e, d) =>
                    e ? reject(e) : resolve(d)));
        }
        // return () => new Promise((resolve, reject) =>
        //     gm(this.inPath)
        //     .noProfile()
        //     .resize(w, h, '^')
        //     .write(imgSuffix(this.outPath, w, h), (e, d) =>
        //         e ? reject(e) : resolve(d)));
    }

    async getTasks(opts={}) {
        // possible size values: 'cover'|'contain'|length/percent(width|width&height) => if passed size=100%, then should function like srcset
        let {
            x = 'center',
            y = 'center',
            size = 'cover', // only need this (and x/y) when resizing both dimensions
            width, height
        } = opts;
        width = width < this.width ? width : this.width;
        size = bgParse(size)[0]; // only supports one bg image for now

        let filterFunc = img => img.w < width && img.h < height;
        if (size.keyword === 'cover') {
            filterFunc = img => img.w < width || img.h < height; // should be || for size: cover
        }

        let gravity = getGrav(x, y);

        let imageSizes = {};
        if ([ size.height, size.width ].filter(s => s && s.unit === 'px').length) {
            for (let d in size)
                imageSizes[d[0]] = size[d].size;
            imageSizes = [ imageSizes ];
        } else {
            imageSizes = this.images
                .filter(filterFunc)
                .sort((a, b) => a.w - b.w);
        }

        const alreadyGenerated = await this.alreadyGenerated;
        const newTasks = imageSizes.map(i => {
            let { w, h } = i;
            if (size.height && size.height.size === 'auto') {
                h = null;
            } else if (size.width && size.width.size === 'auto')
                w = null;
            
            const outPath = imgSuffix(this.outPath, w, h); // need some condition here to decide whether using width, height, or both
            if (alreadyGenerated.includes(outPath))
                return null;
            return this.resizeTask(w, h, {
                gravity: gravity
            });
        }).filter(task => task); // should also filter out any duplicates here: don't resize the same image twice
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
        this.cache = new Data(dataFile); // should construct image classes from this data file if available
        this.maxParallel = maxParallel || os.cpus().length;
        this.tasks = [];
        this.knownImages = [];
    }

    newImage(src) {
        let img = this.knownImages.find(i => i.src === src);
        if (img) return img
        img = new Image(src, this);
        // img = new Image(src, {
        //     inputDir: this.inputDir,
        //     outputDir: this.outputDir
        // });
        this.knownImages.push(img);
        return img;
    }

    async srcset(src, kwargs) {
        if (kwargs && kwargs.__keywords !== true)
            throw new Error('Srcset tag only takes an image and kwargs; found second positional arg.');
        let img = this.newImage(src);
        let { width } = kwargs || await img.measure() || {};

        if (!width) {
            console.warn(`No image found for path: ${src}`);
            return src;
        } else if (typeof width === 'string') {
            width = Number(width.replace(/\D+$/, ''));
        }

        let newTasks = img.getTasks({
            width: kwargs.width,
            size: '100%'
        });
        // const imageSizes = this.images // can do this internal to image class, if storing width / height internally
        //     .filter(img => img.w < width)
        //     .sort((a, b) => a.w - b.w);
        //
        // const existingOutputs = await globby(fileSuffix(img.outPath, '*'));
        // const newTasks = imageSizes.map(i => {
        //     const outPath = imgSuffix(img.outPath, i.w);
        //     if (existingOutputs.includes(outPath))
        //         return null;
        //     return img.resizeTask(i.w);
        // }).filter(task => task); // should also filter out any duplicates here: don't resize the same image twice
        this.tasks = this.tasks.concat(newTasks);
        if (!this.runningTasks)
            await this.runTasks();

        const srcset = [
            ...imageSizes.map(i => `${imgSuffix(img.src, i.w)} ${i.w}w`),
            `${src} ${width}w`
        ];
        return srcset.join(', ');
    }

    async background(selector, src, kwargs) {
        if (kwargs && kwargs.__keywords !== true)
            throw new Error('Srcset tag only takes an image and kwargs; found second positional arg.');
        const img = this.newImage(src);
        let {
            x = 'center',
            y = 'center',
            size = 'cover'
        } = kwargs || {};
        let { width, height } = kwargs || await img.measure() || {};
        if (!width || !height) {
            throw new Error(`No image found for path: ${src}`);
            // console.warn(`No image found for path: ${src}`);
            // return src; // should return something else
        }
        if (typeof width === 'string')
            width = Number(width.replace(/\D+$/, ''));
        if (typeof height === 'string')
            height = Number(height.replace(/\D+$/, ''));

        const mediaQueries = [`
            ${selector} {
                background-position: ${x} ${y};
                background-size: ${size};
            }
        `];

        for (const orientation in this.queries) {
            const q = this.queries[orientation];
            console.log(orientation);
            console.log(q);

            for (let i = 0; i < q.length; i++) {
                const current = q[i];
                const next = q[i+1];
                let queries = {
                    and: [ `(orientation: ${orientation})` ],
                    or: []
                };
                if (i > 0) {
                    queries.and = [
                        ...queries.and,
                        `(max-width: ${current.w}px)`,
                        `(max-height: ${current.h}px)`
                    ];
                }
                if (next) {
                    let minQueries = [];
                    if (next.w < current.w) // are there any problems caused by lacking this? any double loading? possible...needs testing...but these queries wouldn't do anything anyway
                        minQueries.push(`(min-width: ${next.w + 1}px)`)
                    if (next.h < current.h)
                        minQueries.push(`(min-height: ${next.h + 1}px)`);
                    queries.or.push(minQueries);
                }
                q[i].images.forEach((image, j, images) => {
                    // queries.or does not get cleared each time this loops, so it's adding resolution ORs
                    let orQueries = [ ...queries.or ];
                    let webkit = [];
                    let resolution = [];
                    if (j > 0) {
                        webkit.push(`(-webkit-max-device-pixel-ratio: ${image.dppx})`);
                        resolution.push(`(max-resolution: ${image.dppx * 96}dpi)`);
                    }
                    if (j < images.length - 1) {
                        const nImg = images[j + 1];
                        webkit.push(`(-webkit-min-device-pixel-ratio: ${nImg.dppx + 0.01})`);
                        resolution.push(`(min-resolution: ${nImg.dppx * 96 + 1}dpi)`);
                    }
                    if (webkit.length && resolution.length) {
                        orQueries.push([
                            webkit.join(' and '),
                            resolution.join(' and ')
                        ]);
                    }

                    const allQueries = permute(orQueries)
                        .map(q => queries.and.concat(q).join(' and '))
                        .join(', ');

                    console.log('QUERY STRING');
                    console.dir(allQueries);

                    mediaQueries.push(`@media ${allQueries} {
                        ${selector} {
                            background-image: url(${imgSuffix(img.src, image.w, image.h)});
                        }
                    }`);
                });
            }
        }
        return mediaQueries.join('\n');
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
                const srcset = _t.srcset.bind(_t);
                const background = _t.background.bind(_t);
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
                eleventyConfig.addNunjucksAsyncShortcode('background', background);

                eleventyConfig.on('afterBuild', async () => {
                    (await _t.imageSizes.stream).end();
                });
            }
        }
    }
}

module.exports = Images;

// let responsiveImages = [];

// const readData = fs.promises.readFile(dataFile)
//     .then(async data => {
//         await fs.promises.unlink(dataFile);
//         return yaml.safeLoad(data.toString());
//     })
//     .catch(err => {
//         console.error('ERROR');
//         if (err.code === 'ENOENT')
//             return null;
//         else
//             throw err;
//     });
//
// const writeStream = readData.then(() => {
//     const stream = fs.createWriteStream(dataFile, { emitClose: true });
//     stream.on('close', () => console.log('stream closed'));
//     return stream;
// });

// const write = async data => {
//     const stream = await writeStream;
//     // stream.on('error', e => console.error(e));
//     // stream.on('close', () => console.log('stream closed'));
//     return new Promise((resolve, reject) => {
//         console.log('writing data');
//         console.log(data);
//         const line = yaml.safeDump([ data ], { flowLevel: 1 })
//         stream.on('error', e => reject(e));
//         stream.write(line, (err, data) =>
//             err ? reject(err) : resolve(data));
//     });
// }

// const measureImage = async path => {
//     let saved = await readData;
//     saved = saved && saved.find(d => d.path === path);
//     if (saved) {
//         await write({ ...saved, path: path });
//         return saved;
//     }
//     return new Promise((resolve, reject) =>
//         gm(p(path)).size((err, data) => {
//             if (err) {
//                 if (err.code === 1)
//                     resolve({});
//                 else
//                     reject(err);
//             } else {
//                 write({ ...data, path: path })
//                     .then(() => resolve(data));
//             }
//         }));
// };

// const srcset = async function (src, kwargs) {
//     if (kwargs && kwargs.__keywords !== true)
//         throw new Error('Srcset tag only takes an image and kwargs; found second positional arg.');
//     let { width } = kwargs || {};
//     if (!width) width = await measureImage(src);
//
//     if (!width) {
//         console.warn(`No image found for path: ${src}`);
//         return src;
//     } else if (typeof width === 'string') {
//         width = Number(width.replace(/\D+$/, ''));
//     }
//
//     const imageSizes = config.images.sort((a, b) => a.w - b.w);
//     let srcset = [];
//     for (const img of imageSizes) {
//         if (width && width <= img.w) {
//             srcset.push(`${src} ${width}w`);
//             break;
//         }
//         srcset.push(`${imgSuffix(src, img.w, img.h)} ${img.w}w`);
//     }
//
//     responsiveImages.push(src);
//     return srcset.join(', ');
// };

// module.exports.plugin = {
//     initArguments: {},
//     configFunction: function (eleventyConfig) {
//         console.log(eleventyConfig);
//         eleventyConfig.addNunjucksAsyncShortcode('srcset', srcset);
//         eleventyConfig.addLiquidTag('srcset', function(liquidEngine) {
//             return {
//                 parse: function(tagToken) {
//                     this.args = tagToken.args;
//                 },
//                 render: async function(scope) {
//                     console.log(scope);
//                     const evalValue = arg => liquidEngine.evalValue(arg, scope);
//                     const args = await Promise.all(argParse(this.args, evalValue));
//                     return await Promise.resolve(srcset(...args));
//                 }
//             };
//         });
//
//         eleventyConfig.on('afterBuild', async () => {
//             (await writeStream).close();
//         });
//     }
// };
//
