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
    if (h === undefined && w === undefined)
        throw new Error('imgSuffix missing both width and height arguments; needs at least one.');
    else if (!w && !h)
        return src;
    else if (w && !h)
        suffix = `-${w}w`;
    else if (h && !w)
        suffix = `-${h}h`;
    return fileSuffix(src, suffix);
}

const permute = (matrix, permutations=[], a=[]) => {
    if (a.length === matrix.length) { // if is matrix length, consider it a complete permutation and add it to perms
        permutations.push([ ...a ]);
        return permutations;
    }

    let row = matrix[a.length];

    for (let item of row)
        permute(matrix, permutations, [ ...a, item ]); // call function on each row

    return permutations;
};

var uniqByProperty = (arr, prop) =>
    arr.reduce((uniq, obj) => {
        if (!uniq.find(uObj => uObj[prop] === obj[prop]))
            return [ ...uniq, obj ];
        else
            return uniq;
    }, []);

const getOrientation = (w, h) => w >= h ? 'landscape' : 'portrait';

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
        this.availableSizes = opts.images;
        this.queries = opts.queries;
        this.inPath = path.join(this.inputDir, ...src.split('/')); // pointless? would need to split using path.separator
        this.outPath = path.join(this.outputDir, ...src.split('/'));
        this.alreadyGenerated = globby(fileSuffix(this.outPath, '*'));

        this.gmSize = this.gmSize.bind(this);
        this.measure = this.measure.bind(this);
        this.resizeTask = this.resizeTask.bind(this);
        this.getTasks = this.getTasks.bind(this);

        // should start measure here, await where needed

        // this.measureTask = this.measure()
        //     .then(({ width, height }) => {
        //         this.width = width;
        //         this.height = height;
        //         for (let o in this.queries) {
        //             this.queries[o] = this.queries.map(q => ({
        //                 ...q,
        //                 images: q.images.filter(i => i.)
        //             }))
        //         }
        //     });
    }

    get orientation() {
        if (!this.width || !this.height)
            return undefined;
        return getOrientation(this.width, this.height);
    }

    gmSize() { // put outside class
        return new Promise((resolve, reject) =>
            gm(this.inPath)
            .size((err, data) =>
                err ? reject(err) : resolve(data)));
    }

    async measure() {
        // console.log('measuring...');
        let { width, height } = this;
        if (!width || !height) {
            let saved = await this.cache.data; // supposed to be reading from cache
            // let saved = await this.cache.then(r => r.data);
            saved = saved && saved.find(d => d.path === this.inPath);
            ({ width, height } = saved || await this.gmSize()); // catch err.code === 1 from gmSize, means no image found
        }
        await this.cache.write({ path: this.inPath, width: width, height: height });
        Object.assign(this, { width, height });
        // console.log(`width=${this.width}, height=${this.height}`);
        return { width, height };
    }

    // getQueries(opts={}) {
    //     let queries = this.queries;
    //     for (let o in queries) {
    //         console.log({ o });
    //         queries[o] = queries[o]
    //             .filter(q => this.filterFunc(q, opts))
    //             .map(q => {
    //                 let images = [];
    //                 for (let i = q.images.length - 1; i >= 0; i--) { // iterate backwards to go from smaller to larger dppx
    //                     let image = q.images[i];
    //                     if(this.filterFunc(image, opts)) {
    //                         images.push(image);
    //                     } else {
    //                         images.push({ // should provide largest available resolution to devices of higher dppx
    //                             ...image,
    //                             w: null,
    //                             h: null
    //                         });
    //                         break;
    //                     }
    //                 }
    //                 images.sort((a, b) => b.dppx - a.dppx);
    //                 return { ...q, images: images };
    //             });
    //         if (!queries[o].length)
    //             delete queries[o];
    //     }
    //     // need to add original to the queries here...either to landscape or portrait but not both
    //     // can update this.availableSizes based on filtered queries to include landscapes
    //     return queries;
    // }

    resizeTask(w, h, opts={}) {
        let {
            gravity = 'Center',
            crop = false,
        } = opts;
        const outPath = imgSuffix(this.outPath, w, h);
        return async () => {
            try {
                await fs.promises.access(outPath);
            } catch (e) {
                if (e.code === 'ENOENT') {
                    await fs.promises.mkdir(path.dirname(outPath), { recursive: true }); // not necessary if the tags assume the image exists in _site already at right path location...maybe should use that for resizing, as inPath, rather than original file
                    let operations = gm(this.inPath)
                        .noProfile()
                        .gravity(gravity)
                        .resize(w, h, '^') // add option for no-upscale, '>' or '<'
                    if (crop)
                        operations = operations.crop(w, h) // ideally append something to path to indicate image was cropped...
                    return new Promise((resolve, reject) => {
                        // console.log('executing gm');
                        operations.write(outPath, (e, d) =>
                            e ? reject(e) : resolve(d))
                    });
                }
                throw e
            }
            await Promise.resolve(this.alreadyGenerated);
            this.alreadyGenerated.push(outPath);
            return null
        }
        // return () => new Promise((resolve, reject) =>
        //     gm(this.inPath)
        //     .noProfile()
        //     .resize(w, h, '^')
        //     .write(imgSuffix(this.outPath, w, h), (e, d) =>
        //         e ? reject(e) : resolve(d)));
    }

    // filterFunc(img, opts={}) {
    //     let {
    //         size = 'cover',
    //         width, height
    //     } = opts;
    //     if (this.width && !width || this.width < width)
    //         width = this.width;
    //     if (this.height && !height || this.height < height)
    //         height = this.height;
    //     size = bgParse(size)[0]; // only supports one bg image for now
    //
    //     if (size.keyword === 'contain')
    //         return img.w <= width || img.h <= height; 
    //     else if (size.keyword === 'cover')
    //         return img.w <= width && img.h <= height;
    //     else if (size.width.unit === '%' && size.height.size === 'auto') // something similar for vw / vh / vmin / vmax
    //         return width * size.width.size / 100 >= img.w;
    //     else if (size.height.unit === '%' && size.width.size === 'auto')
    //         return height * size.height.size / 100 >= img.h;
    //
    //     console.warn(`Unable to properly filter images for ${img}`);
    //     return false;
    // }

    async getTasks(opts={}) {
        // possible size values: 'cover'|'contain'|length/percent(width|width&height) => if passed size=100%, then should function like srcset
        let {
            x = 'center',
            y = 'center',
            size = 'cover', // only need this (and x/y) when resizing both dimensions
            crop = false,
            width, height
        } = opts;
        if (this.width && !width || this.width < width)
            width = this.width;
        if (this.height && !height || this.height < height)
            height = this.height;
        size = bgParse(size)[0]; // only supports one bg image for now

        let gravity = getGrav(x, y);
        let filterFunc = () => false;
        let queries = this.queries; // load all possible queries, based on supplied devices and possible images
        let imageSizes = this.availableSizes // load possible image sizes, which will be sorted by widest to narrowest
            .sort((a, b) => a.w - b.w);

        if ([ size.height, size.width ].filter(s => s && s.unit === 'px').length) {
            // produce single task if using absolute (non-responsive sizes) for the image
            imageSizes = {};
            queries = {};
            for (let d in size)
                imageSizes[d[0]] = size[d].size || null; // d[0] takes the first letter of either 'width' or 'height' as the new object key

            queries[this.orientation] = [{
                w: imageSizes.w, // these may not be needed
                h: imageSizes.h, // these may not be needed
                images: [{ w: imageSizes.w, h: imageSizes.h, dppx: 1 }]
            }];
            imageSizes = [ imageSizes ];
        } else {
            // for responsive images, determine how to filter out unecessary queries
            let widthOnly = size.width && size.width.unit === '%' && size.height && size.height.size === 'auto';
            let heightOnly = size.height && size.height.unit === '%' && size.width && size.width.size === 'auto';
            if (size.keyword === 'contain' || size.width && size.width.size === 'auto' && size.height && size.height.size === 'auto') {
                filterFunc = img => img.w <= width || img.h <= height;
                // imageSizes = imageSizes.filter(img => img.w <= width && img.h <= height && !(img.w === width && img.h ===height));
            } else if (size.keyword === 'cover') {
                filterFunc = img => img.w <= width && img.h <= height;
                // imageSizes = imageSizes.filter(img => img.w <= width && img.h <= height && !(img.w === width && img.h ===height));
            } else if (widthOnly) { // something similar for vw / vh / vmin / vmax
                filterFunc = img => width * size.width.size / 100 >= img.w;
                imageSizes = uniqByProperty(imageSizes, 'w')
                    // .filter(i => i.w < width)
                    .map(i => ({ ...i, h: null }));
            } else if (heightOnly) {
                filterFunc = img => height * size.height.size / 100 >= img.h;
                imageSizes = uniqByProperty(imageSizes, 'h')
                    // .filter(i => i.h < height)
                    .map(i => ({ ...i, w: null }))
                    .sort((a, b) => a.h - b.h);
            }
            // was filtering imageSizes using filterFunc, but I think I always want the same filter here; only use smaller imageSizes; never upscale
            imageSizes = imageSizes.filter(filterFunc);
            // imageSizes = imageSizes.filter(img => img.w <= width && img.h <= height && !(img.w === width && img.h ===height));
            let keepOriginal = width === this.width && height === this.height; // don't use original size img if user has specified a smaller size in the tag
            console.log({ src: this.src, widthOnly, heightOnly });
            for (let o in queries) {
                queries[o] = queries[o]
                    .filter(filterFunc)
                    .map(q => {
                        let images = [];
                        for (let i = q.images.length - 1; i >= 0; i--) { // iterate backwards to go from smaller to larger dppx
                            let image = q.images[i];
                            if(filterFunc(image)) {
                                if (widthOnly)
                                    image = { ...image, h: null };
                                if (heightOnly)
                                    image = { ...image, w: null };
                                images.push({ ...image, src: imgSuffix(this.src, image.w, image.h) });
                                continue;
                            } else if (keepOriginal) {
                                images.push({ // will provide largest available resolution to devices of higher dppx
                                    ...image,
                                    src: this.src,
                                    w: null,
                                    h: null
                                });
                            }
                            break;
                        }
                        images.sort((a, b) => b.dppx - a.dppx);
                        if (widthOnly)
                            return { ...q, h: null, images: images };
                        if (heightOnly)
                            return { ...q, w: null, images: images };
                        return { ...q, images: images };
                    });
                if (!queries[o].length)
                    delete queries[o];
            }
            if (keepOriginal)
                queries[this.orientation].push({
                    w: this.width,
                    h: this.height,
                    images: [{ w: null, h: null, dppx: 1 }]
                })
        }

        const alreadyGenerated = await Promise.resolve(this.alreadyGenerated);
        // const outputs = [];
        const newTasks = [];

        for (let { w, h } of imageSizes) {
            // console.log('looping imageSizes');
            // console.log({ w, h });
            // if (size.height && size.height.size === 'auto')
            //     h = null;
            // else if (size.width && size.width.size === 'auto')
            //     w = null;

            const outPath = imgSuffix(this.outPath, w, h); // need some condition here to decide whether using width, height, or both
            // outputs.push({ src: outPath, w: w, h: h });
            // outputs.push({ src: imgSuffix(this.src, w, h), w: w, h: h });
            if (alreadyGenerated.includes(outPath))
                continue;
            newTasks.push(this.resizeTask(w, h, {
                gravity: gravity,
                crop: crop
            }));
        }

        // console.log('newTasks');
        // console.log(newTasks);

        // const newTasks = imageSizes.map(i => {
        //     let { w, h } = i;
        //     if (size.height && size.height.size === 'auto')
        //         h = null;
        //     else if (size.width && size.width.size === 'auto')
        //         w = null;
        //     
        //     const outPath = imgSuffix(this.outPath, w, h); // need some condition here to decide whether using width, height, or both
        //     outputs.push({ src: outPath, w: w, h: h });
        //     if (alreadyGenerated.includes(outPath))
        //         return null;
        //     return this.resizeTask(w, h, {
        //         gravity: gravity
        //     });
        // }).filter(task => task); // should also filter out any duplicates here: don't resize the same image twice

        // console.log('outputs')
        // console.log(outputs)

        return {
            tasks: newTasks,
            // output: outputs,
            output: imageSizes,
            queries: queries
        }
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

    async newImage(src) {
        let img = this.knownImages.find(i => i.src === src);
        if (img) return img
        img = new Image(src, this);
        await img.measure();
        this.knownImages.push(img);
        return img;
    }

    async srcset(src, kwargs) {
        // console.log('calling SRCSET');
        // console.log({ src, kwargs });
        if (kwargs && kwargs.__keywords !== true)
            throw new Error('Srcset tag only takes an image and kwargs; found second positional arg.');
        let img = await this.newImage(src);
        // let { width } = kwargs || await img.measure() || {};
        let width = (kwargs && kwargs.width) || img.width;

        if (!width) {
            console.warn(`No image found for path: ${src}`);
            return src;
        } else if (typeof width === 'string') {
            width = Number(width.replace(/\D+$/, ''));
        }

        let newTasks = await img.getTasks({
            width: width, // can't do kwargs.width here if no kwargs. could do kwargs && kwargs.width, but seems not worth it
            size: '100%'
        });

        // console.log('srcset newTasks');
        // console.log(newTasks.tasks);

        // const imageSizes = this.images // can do this internal to image class, if storing width / height internally
        //     .filter(img => img.w < width) // but can only keep it consistent / internal if using *image* width/height, not that provided by kwargs
        //     .sort((a, b) => a.w - b.w);
        //
        // const existingOutputs = await globby(fileSuffix(img.outPath, '*'));
        // const newTasks = imageSizes.map(i => {
        //     const outPath = imgSuffix(img.outPath, i.w);
        //     if (existingOutputs.includes(outPath))
        //         return null;
        //     return img.resizeTask(i.w);
        // }).filter(task => task); // should also filter out any duplicates here: don't xesize the same image twice
        // this.tasks = this.tasks.concat(newTasks.tasks);
        // if (!this.runningTasks)
        //     await this.runTasks();
        
        await this.addTasks(newTasks.tasks); // add to afterBuild

        const srcset = [
            // ...imageSizes.map(i => `${imgSuffix(img.src, i.w)} ${i.w}w`),
            newTasks.output.map(i => `${imgSuffix(src, i.w)} ${i.w}w`), // produces bad output when no tasks
            `${src} ${width}w`
        ];
        return srcset.join(', ');
    }

    async background(selector, src, kwargs) {
        // console.log('calling BACKGROUND');
        // console.log({ selector, src, kwargs });
        if (kwargs && kwargs.__keywords !== true)
            throw new Error('Srcset tag only takes an image and kwargs; found second positional arg.');
        const img = await this.newImage(src);
        let {
            x = 'center',
            y = 'center',
            size = 'cover',
            crop = false // when true, need to change sizing behavior...only show cropped image when it wouldn't cause the image to upscale
        } = kwargs || {};
        // let { width, height } = kwargs || {};
        // if (!width || !height)
        //     ({ width, height } = img);
        let { width, height } = img;
        if (!width || !height) {
            throw new Error(`No image found for path: ${src}`);
            // console.warn(`No image found for path: ${src}`);
            // return src; // should return something else
        }
        if (typeof width === 'string')
            width = Number(width.replace(/\D+$/, ''));
        if (typeof height === 'string')
            height = Number(height.replace(/\D+$/, ''));

        let newTasks = await img.getTasks({
            x: 'center',
            y: 'center',
            size: 'cover',
            crop: crop,
            ...kwargs,
        });

        // console.log('background newTasks');
        // console.log(newTasks.tasks);

        await this.addTasks(newTasks.tasks); // add to afterBuild

        // let newTasks = img.getTasks({
        //     width: kwargs.width,
        //     height: kwargs.height,
        //     size: size,
        //     x: x, y: y
        // });

        // DOUBLE LOADING
        //
        // 1353x909 at 1 dpr triggers both rules (which load the same image)
        //
        // @media (orientation: landscape) and (max-width: 1366px) and (max-height: 1024px) and (min-width: 1281px) and (-webkit-max-device-pixel-ratio: 1),
        // (orientation: landscape) and (max-width: 1366px) and (max-height: 1024px) and (min-width: 1281px) and (max-resolution: 96dpi),
        // (orientation: landscape) and (max-width: 1366px) and (max-height: 1024px) and (min-height: 801px) and (-webkit-max-device-pixel-ratio: 1),
        // (orientation: landscape) and (max-width: 1366px) and (max-height: 1024px) and (min-height: 801px) and (max-resolution: 96dpi) {
        //     .bg-test {
        //         background-image: url(/images/DSC03270-1920x1280.jpg);
        //     }
        // }
        //
        // @media (orientation: landscape) and (max-width: 1680px) and (max-height: 1050px) and (min-width: 1441px),
        // (orientation: landscape) and (max-width: 1680px) and (max-height: 1050px) and (min-height: 901px) {
        //     .bg-test {
        //         background-image: url(/images/DSC03270-1920x1280.jpg);
        //     }
        // }

        const mediaQueries = [`
            ${selector} {
                background-position: ${x} ${y};
                background-size: ${size};
            }
        `];

        let availableQueries = newTasks.queries;
        console.dir(availableQueries, { depth: null });

        for (const orientation in availableQueries) {
            // if (!crop && orientation !== img.orientation)
            //     continue;
            // console.log(orientation);
            // console.log(q);
            const other = Object.keys(availableQueries).find(k => k !== orientation);
            const maxOther = availableQueries[other].reduce((max, q) => {
                if (q.w >= max.w && q.h >= max.h) {
                    return { w: q.w, h: q.h };
                } else if (q.w > max.w) {
                    return { ...max, w: q.w };
                } else if (q.h > max.h) {
                    return { ...max, h: q.h };
                } else {
                    return max;
                }
            }, { w: 0, h: 0 })

            const q = availableQueries[orientation];
            for (let i = 0; i < q.length; i++) {
                const current = q[i];
                const next = q[i+1];
                if (src === '/images/IMG_0205.jpg') {
                    console.dir(current, { depth: null });
                }
                // let queries = {
                //     and: [ `(orientation: ${orientation})` ], // should only add 'landscape' orientation for queries with a min that infringes on some portrait orientation...can be achieved by moving the logic from the devices.js file into here
                //     or: []
                // };
                let queries = {
                    and: [],
                    or: []
                };
                // in order to *drop* the orientation query, next.w > max.w AND next.h > max.h
                // console.dir({ next, maxOther }, { depth: null });
                let addOrientation = (next && (next.w <= maxOther.w || next.h <= maxOther.h)) || current.w <= maxOther.w || current.h <= maxOther.h
                // if (!next || next.w <= maxOther.h && next.h <= maxOther.w) {
                //     console.log('adding orientation');
                //     queries.and = [ `(orientation: ${orientation})` ];
                // }
                if (i > 0) {
                    if (addOrientation)
                        queries.and.push(`(orientation: ${orientation})`);
                    if (current.w)
                        queries.and.push(`(max-width: ${current.w}px)`);
                    if (current.h)
                        queries.and.push(`(max-height: ${current.h}px)`);
                }
                if (next) {
                    let minQueries = [];
                    if (next.w && next.w < current.w) // are there any problems caused by lacking this? any double loading? possible...needs testing...but these queries wouldn't do anything anyway
                        minQueries.push(`(min-width: ${next.w + 1}px)`);
                    if (next.h && next.h < current.h)
                        minQueries.push(`(min-height: ${next.h + 1}px)`);
                    queries.or.push(minQueries);
                }
                // add dppx queries
                console.dir({ images: q[i].images }, { depth: null });
                q[i].images.forEach((image, j, images) => { // bad variable names
                    // console.log(image);
                    const nImg = images[j + 1];
                    let orQueries = [ ...queries.or ];
                    let webkit = [];
                    let resolution = [];
                    if (j > 0 && image.dppx) {
                        webkit.push(`(-webkit-max-device-pixel-ratio: ${image.dppx})`);
                        resolution.push(`(max-resolution: ${image.dppx * 96}dpi)`);
                    }
                    if (j < images.length - 1 && nImg.dppx) {
                        webkit.push(`(-webkit-min-device-pixel-ratio: ${nImg.dppx + 0.01})`);
                        resolution.push(`(min-resolution: ${nImg.dppx * 96 + 1}dpi)`);
                    }
                    if (webkit.length && resolution.length) {
                        orQueries.push([
                            webkit.join(' and '),
                            resolution.join(' and ')
                        ]);
                    }

                    // console.log('orQueries');
                    // console.log(orQueries);


                    const allQueries = permute(orQueries)
                        .map(q => queries.and.concat(q).join(' and '))
                        .join(', ');

                    if (src === '/images/IMG_0205.jpg') {
                        console.log('QUERY STRING');
                        console.dir(allQueries);
                    }
                    
                    // let bgImg = newTasks.output.find(i => i.w === image.w && i.h === image.h);
                    // bgImg = bgImg ? imgSuffix(src, bgImg.w, bgImg.h) : src;
                    let bgImg = image.src || src;
                    // console.log({ bgImg });

                    mediaQueries.push(`@media ${allQueries} {
                        ${selector} {
                            background-image: url(${bgImg});
                        }
                    }`);
                });
            }
        }
        return mediaQueries.join('\n');
    }

    async addTasks(newTasks) {
        this.tasks = this.tasks.concat(newTasks);
        if (!this.runningTasks)
            await this.runTasks();
    }

    async runTasks() { // runs async processes
        this.runningTasks = true;
        const results = [];
        const executing = [];
        while (this.tasks.length) {
            if (executing.length < this.maxParallel) {
                let task = this.tasks.shift();
                // console.log('logging task');
                // console.log(task);
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
        // console.log('tasks complete');
        // console.log(results);
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
                    (await _t.cache.stream).end();
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
